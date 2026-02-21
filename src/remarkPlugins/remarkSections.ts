import type { Plugin } from 'unified';
import type { Root, Content } from 'mdast';

export const remarkSections: Plugin<[], Root> = () => {
  return (tree) => {
    const newChildren: Content[] = [];
    let currentSection: Content[] = [];

    const pushSection = () => {
      if (currentSection.length === 0) return;

      newChildren.push({
        type: 'html',
        value: '<section>',
      });

      newChildren.push(...currentSection);

      newChildren.push({
        type: 'html',
        value: '</section>',
      });

      currentSection = [];
    };

    for (const node of tree.children) {
      if (node.type === 'thematicBreak') {
        pushSection();
      } else {
        currentSection.push(node);
      }
    }

    pushSection();

    // Ensure at least one section even if no `---`
    if (newChildren.length === 0 && tree.children.length > 0) {
      newChildren.push({
        type: 'html',
        value: '<section>',
      });
      newChildren.push(...tree.children);
      newChildren.push({
        type: 'html',
        value: '</section>',
      });
    }

    tree.children = newChildren;
  };
};
