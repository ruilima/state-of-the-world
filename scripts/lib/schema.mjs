// Minimal structural schema checker. Used twice:
//   1. on raw upstream responses, so a format change upstream is detected
//      before it silently corrupts our output;
//   2. on our own public/data/*.json files, in tests.
// A schema is a plain object built with the helpers below.

export const s = {
  str: { type: 'string' },
  num: { type: 'number' },
  bool: { type: 'boolean' },
  any: { type: 'any' },
  nullable: (inner) => ({ type: 'nullable', inner }),
  arr: (item, { min = 0 } = {}) => ({ type: 'array', item, min }),
  obj: (props, { optional = [] } = {}) => ({ type: 'object', props, optional }),
  map: (value) => ({ type: 'map', value }),
  oneOf: (...values) => ({ type: 'enum', values }),
};

export function check(schema, value, path = '$', errors = []) {
  switch (schema.type) {
    case 'any':
      break;
    case 'nullable':
      if (value !== null && value !== undefined) check(schema.inner, value, path, errors);
      break;
    case 'string':
    case 'boolean':
      if (typeof value !== schema.type) errors.push(`${path}: expected ${schema.type}, got ${typeOf(value)}`);
      break;
    case 'number':
      if (typeof value !== 'number' || Number.isNaN(value)) errors.push(`${path}: expected number, got ${typeOf(value)}`);
      break;
    case 'enum':
      if (!schema.values.includes(value)) errors.push(`${path}: expected one of ${schema.values.join('|')}, got ${JSON.stringify(value)}`);
      break;
    case 'array':
      if (!Array.isArray(value)) { errors.push(`${path}: expected array, got ${typeOf(value)}`); break; }
      if (value.length < schema.min) errors.push(`${path}: expected at least ${schema.min} items, got ${value.length}`);
      // Checking the first few items is enough to catch a format change.
      value.slice(0, 5).forEach((v, i) => check(schema.item, v, `${path}[${i}]`, errors));
      break;
    case 'object':
      if (!isObj(value)) { errors.push(`${path}: expected object, got ${typeOf(value)}`); break; }
      for (const [k, sub] of Object.entries(schema.props)) {
        if (!(k in value)) {
          if (!schema.optional.includes(k)) errors.push(`${path}.${k}: missing`);
          continue;
        }
        check(sub, value[k], `${path}.${k}`, errors);
      }
      break;
    case 'map':
      if (!isObj(value)) { errors.push(`${path}: expected object, got ${typeOf(value)}`); break; }
      for (const [k, v] of Object.entries(value)) check(schema.value, v, `${path}.${k}`, errors);
      break;
    default:
      throw new Error(`unknown schema type ${schema.type}`);
  }
  return errors;
}

export class SchemaError extends Error {
  constructor(source, errors) {
    super(`${source}: upstream format changed — ${errors.slice(0, 5).join('; ')}`);
    this.name = 'SchemaError';
    this.errors = errors;
  }
}

export function assertSchema(source, schema, value) {
  const errors = check(schema, value);
  if (errors.length) throw new SchemaError(source, errors);
  return value;
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
