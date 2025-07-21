// plugins/remarkPageLink.ts
import { visit } from 'unist-util-visit'
import type { Plugin } from 'unified'

export const remarkPageLink: Plugin = () => {
  return (tree: any) => {
    visit(tree, 'text', (node, index, parent) => {
      const regex = /:(\d+)/g
      let match
      const newChildren = []
      let lastIndex = 0

      while ((match = regex.exec(node.value)) !== null) {
        const matchIndex = match.index
        const number = parseInt(match[1])

        if (matchIndex > lastIndex) {
          newChildren.push({ type: 'text', value: node.value.slice(lastIndex, matchIndex) })
        }

        newChildren.push({
          type: 'mdxJsxTextElement',
          name: 'PageLink',
          attributes: [
            {
              type: 'mdxJsxAttribute',
              name: 'value',
              value: number
            }
          ],
          children: []
        })

        lastIndex = matchIndex + match[0].length
      }

      if (lastIndex < node.value.length) {
        newChildren.push({ type: 'text', value: node.value.slice(lastIndex) })
      }

      if (newChildren.length > 0 && parent?.children) {
        parent.children.splice(index, 1, ...newChildren)
      }
    })
  }
}
