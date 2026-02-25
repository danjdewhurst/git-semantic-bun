import type { IndexedCommit, SearchFilters } from "./types.ts";

export function applyFilters(commits: readonly IndexedCommit[], filters: SearchFilters): IndexedCommit[] {
  return commits.filter((commit) => {
    if (filters.author) {
      const authorNeedle = filters.author.toLowerCase();
      if (!commit.author.toLowerCase().includes(authorNeedle)) {
        return false;
      }
    }

    if (filters.after) {
      const commitDate = new Date(commit.date);
      if (!(commitDate > filters.after)) {
        return false;
      }
    }

    if (filters.before) {
      const commitDate = new Date(commit.date);
      if (!(commitDate < filters.before)) {
        return false;
      }
    }

    if (filters.file) {
      const fileNeedle = filters.file.toLowerCase();
      const hasFile = commit.files.some((file) => file.toLowerCase().includes(fileNeedle));
      if (!hasFile) {
        return false;
      }
    }

    return true;
  });
}
