/* Built-in JSONBin sync config so star/flag/seen sync automatically on every
   device with no setup. This is a PUBLIC repo: this Access Key is scoped to
   Read + Update on this single bin only (no Delete/List/Create, no account
   access). Worst case if abused: someone overwrites this bin's star/flag data,
   which you can fix by rotating the key in JSONBin and updating this file.
   A per-device override or "turn off" via the ☁ Sync panel still takes priority. */
window.JLE_SYNC_DEFAULT = {
  binId: "6a1a6eeb21f9ee59d29cb280",
  key: "$2a$10$62ujMrEZTKy/zNE73NXRzuSlBlQtKwoO79BrN51PSwQxkq9Mrq3dy",
  keyType: "access"
};
