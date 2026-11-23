// Express 5 forwards rejected promises to the error handler automatically;
// this wrapper keeps handlers explicit and works the same on Express 4.
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
