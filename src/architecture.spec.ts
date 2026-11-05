import * as fs from 'fs';
import * as path from 'path';

const MODULES_DIR = path.join(__dirname, 'modules');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [fullPath] : [];
  });
}

function importsOf(file: string): string[] {
  const source = fs.readFileSync(file, 'utf8');
  return [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

function layerFiles(layer: 'application' | 'domain'): string[] {
  return sourceFiles(MODULES_DIR).filter((file) => file.includes(`${path.sep}${layer}${path.sep}`));
}

function violations(files: string[], isForbidden: (specifier: string) => boolean): string[] {
  return files.flatMap((file) =>
    importsOf(file)
      .filter(isForbidden)
      .map((specifier) => `${path.relative(MODULES_DIR, file)} -> ${specifier}`),
  );
}

describe('Reglas de capas', () => {
  it('application no depende de los DTOs de red', () => {
    const found = violations(layerFiles('application'), (specifier) => specifier.includes('infrastructure/dtos'));
    expect(found).toEqual([]);
  });

  it('application y domain no usan decoradores de validación de red', () => {
    const files = [...layerFiles('application'), ...layerFiles('domain')];
    const found = violations(files, (specifier) => specifier === 'class-validator' || specifier === 'class-transformer');
    expect(found).toEqual([]);
  });

  it('domain no depende de application ni de infrastructure', () => {
    const found = violations(layerFiles('domain'), (specifier) => /\/(application|infrastructure)\//.test(specifier));
    expect(found).toEqual([]);
  });

  it('los DTOs viven en infrastructure/dtos', () => {
    const misplaced = sourceFiles(MODULES_DIR)
      .filter((file) => file.endsWith('.dto.ts') && !file.includes(`infrastructure${path.sep}dtos`))
      .map((file) => path.relative(MODULES_DIR, file));
    expect(misplaced).toEqual([]);
  });
});
