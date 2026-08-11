// Express 5 exposes req.query through a getter, so parsed values cannot be
// written back onto req. Everything validated lands on req.validated instead,
// and controllers read only from there.
export function validate(schemas) {
  return (req, res, next) => {
    const validated = {};
    for (const part of ['body', 'query', 'params', 'headers']) {
      if (schemas[part]) {
        validated[part] = schemas[part].parse(req[part]);
      }
    }
    req.validated = validated;
    next();
  };
}
