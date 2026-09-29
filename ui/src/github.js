// Minimal GitHub REST/GraphQL client used directly from the browser.
window.CC_GitHub = (() => {
  const API = 'https://api.github.com';
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  class GitHubError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }

  function create(token, { onWait } = {}) {
    async function request(path, { method = 'GET', body } = {}, attempt = 0) {
      let response;
      try {
        response = await fetch(API + path, {
          method,
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          cache: 'no-store',
        });
      } catch {
        throw new GitHubError(0, 'NETWORK');
      }
      if (response.status === 204) return null;
      const data = await response.json().catch(() => null);
      if (response.ok) return data;

      // Primary and secondary rate limits: wait as instructed, then retry.
      const limited = response.status === 429 || (response.status === 403 && (
        response.headers.get('retry-after') ||
        response.headers.get('x-ratelimit-remaining') === '0' ||
        /rate limit/i.test(data?.message ?? '')
      ));
      if (limited && attempt < 6) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const reset = Number(response.headers.get('x-ratelimit-reset'));
        let seconds = retryAfter > 0 ? retryAfter : 60;
        if (!retryAfter && response.headers.get('x-ratelimit-remaining') === '0' && reset) {
          seconds = Math.max(1, reset - Math.floor(Date.now() / 1000));
        }
        onWait?.(seconds);
        await sleep(seconds * 1000);
        return request(path, { method, body }, attempt + 1);
      }
      throw new GitHubError(response.status, data?.message || response.statusText || 'Request failed');
    }

    async function graphql(query, variables) {
      const data = await request('/graphql', { method: 'POST', body: { query, variables } });
      if (data?.errors?.length) throw new GitHubError(200, data.errors[0].message);
      return data.data;
    }

    const repoPath = (fullName) => `/repos/${fullName.split('/').map(encodeURIComponent).join('/')}`;

    return {
      async user() {
        const user = await request('/user');
        return {
          login: user.login,
          id: user.id,
          name: user.name || user.login,
          avatar: user.avatar_url,
          url: user.html_url,
          email: `${user.id}+${user.login}@users.noreply.github.com`,
        };
      },

      async repos() {
        const list = [];
        for (let page = 1; page <= 5; page += 1) {
          const batch = await request(`/user/repos?affiliation=owner&sort=pushed&per_page=100&page=${page}`);
          list.push(...batch);
          if (batch.length < 100) break;
        }
        return list
          .filter((repo) => !repo.fork && !repo.archived && repo.permissions?.push !== false)
          .map((repo) => ({
            fullName: repo.full_name,
            private: repo.private,
            branch: repo.default_branch,
            description: repo.description ?? '',
          }));
      },

      async hasFile(fullName, path) {
        try {
          await request(`${repoPath(fullName)}/contents/${path}`);
          return true;
        } catch {
          return false;
        }
      },

      async createRepo(name, isPrivate) {
        const repo = await request('/user/repos', {
          method: 'POST',
          body: { name, private: isPrivate, description: 'Contribution art made with Commit Canvas', auto_init: false },
        });
        return { fullName: repo.full_name, private: repo.private, branch: repo.default_branch, description: repo.description ?? '' };
      },

      // Returns weeks as arrays of 7 slots ({date, count, level} or null).
      async calendar(year) {
        const variables = year ? { from: `${year}-01-01T00:00:00Z`, to: `${year}-12-31T23:59:59Z` } : {};
        const data = await graphql(`query($from: DateTime, $to: DateTime) {
          viewer { contributionsCollection(from: $from, to: $to) {
            contributionYears
            contributionCalendar { totalContributions weeks { contributionDays { date weekday contributionCount contributionLevel } } }
          } }
        }`, variables);
        const collection = data.viewer.contributionsCollection;
        const levels = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
        const weeks = collection.contributionCalendar.weeks.map((week) => {
          const slots = Array(7).fill(null);
          for (const day of week.contributionDays) {
            slots[day.weekday] = { date: day.date, count: day.contributionCount, level: levels[day.contributionLevel] ?? 0 };
          }
          return slots;
        });
        return { weeks, years: collection.contributionYears, total: collection.contributionCalendar.totalContributions };
      },

      // Creates one empty commit per entry of `dates` (repeated dates allowed)
      // on top of the default branch, then fast-forwards the branch once.
      async paint(fullName, dates, author, onProgress) {
        const base = repoPath(fullName);
        const repo = await request(base);
        if (!repo.permissions?.push) throw new GitHubError(403, 'NO_PUSH');
        const branch = repo.default_branch;
        const ref = `/git/ref/heads/${encodeURIComponent(branch)}`;

        let head;
        try {
          head = (await request(base + ref)).object.sha;
        } catch (error) {
          if (error.status !== 404 && error.status !== 409) throw error;
          // Empty repository: seed it with a README. The seed commit uses an
          // unlinked identity so it does not add a contribution for today.
          const seedAuthor = { name: 'Commit Canvas', email: 'commit-canvas@users.noreply.invalid' };
          const seeded = await request(`${base}/contents/README.md`, {
            method: 'PUT',
            body: {
              message: 'Initialize contribution art repository',
              content: btoa('# Contribution art\n\nMade with Commit Canvas.\n'),
              author: seedAuthor,
              committer: seedAuthor,
            },
          });
          head = seeded.commit.sha;
        }
        const tree = (await request(`${base}/git/commits/${head}`)).tree.sha;

        let parent = head;
        const perDay = new Map();
        for (let i = 0; i < dates.length; i += 1) {
          const date = dates[i];
          const n = (perDay.get(date) ?? 0) + 1;
          perDay.set(date, n);
          const stamp = { name: author.name, email: author.email, date: noonOn(date, n) };
          const commit = await request(`${base}/git/commits`, {
            method: 'POST',
            body: { message: `Commit Canvas ${date} #${n}`, tree, parents: [parent], author: stamp, committer: stamp },
          });
          parent = commit.sha;
          onProgress?.(i + 1, dates.length);
        }

        onProgress?.(dates.length, dates.length, 'push');
        await request(`${base}/git/refs/heads/${encodeURIComponent(branch)}`, {
          method: 'PATCH',
          body: { sha: parent, force: false },
        });
        return { fullName, branch, before: head, after: parent, count: dates.length };
      },

      // Moves the branch back to `before`, only if it still points at `after`.
      async undoPaint({ fullName, branch, before, after }) {
        const base = repoPath(fullName);
        const current = (await request(`${base}/git/ref/heads/${encodeURIComponent(branch)}`)).object.sha;
        if (current !== after) throw new GitHubError(409, 'MOVED');
        await request(`${base}/git/refs/heads/${encodeURIComponent(branch)}`, {
          method: 'PATCH',
          body: { sha: before, force: true },
        });
      },
    };
  }

  // Local noon on `date` with the browser's UTC offset, plus a few seconds so
  // commits on the same day keep their order.
  function noonOn(date, n) {
    const [y, m, d] = date.split('-').map(Number);
    const offset = -new Date(y, m - 1, d, 12).getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const hh = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
    const mm = String(Math.abs(offset) % 60).padStart(2, '0');
    const seconds = String(n % 60).padStart(2, '0');
    const minutes = String(Math.floor(n / 60) % 60).padStart(2, '0');
    return `${date}T12:${minutes}:${seconds}${sign}${hh}:${mm}`;
  }

  return { create, GitHubError, noonOn };
})();
