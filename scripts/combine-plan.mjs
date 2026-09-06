import fs from 'node:fs';
const directory = 'Documentation/ExecutionPlan/';
const index = fs.readFileSync(`${directory}README.md`, 'utf8').replaceAll('](../', '](Documentation/').replaceAll('](Phase-', '](Documentation/ExecutionPlan/Phase-');
const phases = fs.readdirSync(directory).filter(name => /^Phase-\d\d-.*\.md$/.test(name)).sort();
fs.writeFileSync('ImplementationPlan.md', index + '\n\n---\n\n' + phases.map(name => fs.readFileSync(directory + name, 'utf8').trim()).join('\n\n---\n\n') + '\n');
