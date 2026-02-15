module.exports = {
  branches: ["main"],
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        preset: "angular",
        releaseRules: [
          { type: "bio", release: "minor" }, // New person = Minor version
          { type: "content", release: "patch" }, // Update person = Patch version
          { type: "fix", release: "patch" }, // Code fix = Patch version
          { type: "feat", release: "minor" }, // New site feature = Minor version
        ],
      },
    ],
    [
      "@semantic-release/release-notes-generator",
      {
        preset: "angular",
        writerOpts: {
          transform: (commit) => {
            // 1. Create a shallow copy so we don't try to mutate the read-only object
            const newCommit = { ...commit };

            // 2. Map your custom types using the new object
            if (newCommit.type === "bio") {
              newCommit.type = "New Biographies";
            } else if (newCommit.type === "content") {
              newCommit.type = "Biography Updates";
            } else if (newCommit.type === "feat") {
              newCommit.type = "Website Features";
            } else if (newCommit.type === "fix") {
              newCommit.type = "Bug Fixes";
            } else {
              // Return null or undefined to exclude other types from the changelog
              return;
            }

            return newCommit;
          },
        },
      },
    ],
    "@semantic-release/changelog",
    [
      "@semantic-release/npm",
      {
        npmPublish: false,
      },
    ],
    [
      "@semantic-release/exec",
      {
        // This creates the zip file Zenodo/GitHub will host
        prepareCmd: "zip -r release-${nextRelease.version}.zip dist",
      },
    ],
    [
      "@semantic-release/github",
      {
        assets: [
          {
            path: "release-*.zip",
            label: "Biography Archive (v${nextRelease.version})",
          },
        ],
      },
    ],
    [
      "@semantic-release/git",
      {
        assets: ["package.json", "CHANGELOG.md"],
        message:
          "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
      },
    ],
  ],
};
