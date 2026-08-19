/**
 * A widget's id, which is the name shown in the property editor and the
 * hierarchy tree.
 *
 * It is an identifier, not a label: code generation turns it into the C
 * variable the whole generated UI refers to, and every event binding, logic
 * graph and Modbus binding points at the widget through it. Whitespace has no
 * place in one — leading, trailing or in the middle — so it is taken out where
 * an id is typed rather than left to surprise someone at build time.
 *
 * Inner runs of whitespace become a single underscore, which is the separator
 * ids already use (`Button_1`); the ends are simply trimmed.
 */

/** The id a typed string is worth, with whitespace resolved. */
export function sanitizeComponentId(value: string): string {
  return value.trim().replace(/\s+/g, '_');
}

/**
 * The id to keep after an edit: the sanitised one, or the previous id when
 * that leaves nothing at all. A widget without an id has no variable to
 * generate and nothing to bind to.
 */
export function commitComponentId(value: string, previous: string): string {
  const next = sanitizeComponentId(value);
  return next.length > 0 ? next : previous;
}
