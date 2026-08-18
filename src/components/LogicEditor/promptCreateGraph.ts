import { modal } from '../Modal';

// Prompt for a new graph name, suggesting one no existing graph uses.
// Two graphs with the same name are indistinguishable in the list, so a
// duplicate is rejected and the prompt reopens with the rejected name.
export async function promptCreateGraph(
  graphs: { name: string }[],
  createGraph: (name: string) => string
): Promise<string | null> {
  const taken = new Set(graphs.map(graph => graph.name));
  let suggestion = 'New Logic Graph';
  for (let index = 2; taken.has(suggestion); index++) suggestion = `New Logic Graph ${index}`;

  for (;;) {
    const name = (await modal.prompt('Enter a logic graph name:', suggestion))?.trim();
    if (!name) return null;
    if (!taken.has(name)) return createGraph(name);
    await modal.alert(`A logic graph named "${name}" already exists.`);
    suggestion = name;
  }
}
