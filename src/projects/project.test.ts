import { id } from '../../test/ids';
import {
  addLabel,
  changeLabel,
  createProject,
  decodeProject,
  normalizeName,
  ProjectError,
  renameProject,
  validateId,
} from './project';

test.each(['', '   ', '\tname', 'name\n', 'a\u0000b', '\u0085'])(
  'rejects empty/control names %j',
  (name) => {
    expect(() => normalizeName(name)).toThrow(new ProjectError('invalid-name'));
  },
);
test('normalizes Unicode/outer whitespace while retaining legitimate content without a cap', () => {
  expect(normalizeName('  cafe\u0301  👩‍🔬   ')).toBe('café  👩‍🔬');
  expect(normalizeName('A'.repeat(10000))).toHaveLength(10000);
  expect(() => normalizeName(null as unknown as string)).toThrow('invalid-name');
});
test.each(['', '123', 'ABCDEF00-0000-4000-8000-000000000001'])(
  'rejects invalid IDs %s',
  (value) => {
    expect(() => validateId(value)).toThrow('invalid-id');
  },
);
test('creates/renames and adds duplicate display names with stable IDs and no mutation', () => {
  const project = createProject(id(1), ' Project ');
  expect(project).toEqual({ id: id(1), name: 'Project', revision: 1, labels: [] });
  expect(renameProject(project, 'Project')).toBe(project);
  const renamed = renameProject(project, 'Next');
  expect(renamed).toEqual({ ...project, name: 'Next', revision: 2 });
  const labels = addLabel(addLabel(renamed, id(2), 'Same'), id(3), 'Same');
  expect(labels.labels.map((label) => label.id)).toEqual([id(2), id(3)]);
  expect(project.labels).toEqual([]);
  expect(() => addLabel(labels, id(2), 'Duplicate')).toThrow('duplicate-id');
  expect(() => addLabel(project, id(1), 'Duplicate')).toThrow('duplicate-id');
});
test('rename/archive/restore retain IDs, reject missing labels and make repeats no-ops', () => {
  const initial = addLabel(createProject(id(1), 'P'), id(2), 'Old');
  const renamed = changeLabel(initial, id(2), { name: 'New' });
  const archived = changeLabel(renamed, id(2), { archived: true });
  expect(archived.labels).toEqual([{ id: id(2), name: 'New', archived: true }]);
  expect(changeLabel(archived, id(2), { name: 'New', archived: true })).toBe(archived);
  expect(changeLabel(archived, id(2), {})).toBe(archived);
  expect(changeLabel(archived, id(2), { archived: false }).labels[0]?.archived).toBe(false);
  expect(initial.labels[0]?.name).toBe('Old');
  expect(() => changeLabel(initial, id(3), { name: 'X' })).toThrow('missing-label');
  expect(() => renameProject({ ...initial, revision: Number.MAX_SAFE_INTEGER }, 'X')).toThrow(
    'invalid-project',
  );
  expect(changeLabel(initial, id(2), { name: 'Old' })).toBe(initial);
  const withOther = addLabel(initial, id(3), 'Other');
  expect(changeLabel(withOther, id(2), { name: 'New' }).labels[1]).toBe(withOther.labels[1]);
});
test('decodes known fields only and rejects corrupt storage without leaking it', () => {
  const project = addLabel(createProject(id(1), 'P'), id(2), 'L');
  expect(decodeProject(JSON.stringify({ ...project, secret: 'unused' }))).toEqual(project);
  for (const value of [
    null,
    {},
    { ...project, id: 'bad' },
    { ...project, name: ' P ' },
    { ...project, revision: 0 },
    { ...project, revision: 1.2 },
    { ...project, labels: null },
    { ...project, labels: [null] },
    { ...project, labels: [...project.labels, ...project.labels] },
    { ...project, labels: [{ id: id(3), name: 'L', archived: 1 }] },
  ])
    expect(() => decodeProject(JSON.stringify(value))).toThrow('invalid-project');
  expect(() => decodeProject('invalid private JSON')).toThrow(new ProjectError('invalid-project'));
});
