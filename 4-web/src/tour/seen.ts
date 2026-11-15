const KEY = "tour:seen";
let seen = false;

export function tourSeen() {
  if (seen) return true;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function markTourSeen() {
  seen = true;
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* Keep the in-memory flag. */
  }
}
