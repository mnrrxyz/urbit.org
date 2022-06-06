import React from "react";
import Markdoc, { Ast, Node, Tag } from "@markdoc/markdoc";
import { heading } from "./schema/Heading.markdoc";
import { footnoteRef } from "./schema/footnoteRef.markdoc";
import { footnoteItem } from "./schema/footnoteItem.markdoc";
import { link } from "./schema/link.markdoc";
import Tabs from "../components/Tabs";
import Tab from "../components/Tab";
import Button from "../components/Button";
import Callout from "../components/Callout";
import Highlight, { defaultProps } from "prism-react-renderer";
import Prism from "prism-react-renderer/prism";
(typeof global !== "undefined" ? global : window).Prism = Prism;
require("prismjs/components/prism-hoon");

// img is wrapped in figure so that images can be extra wide in the blog posts
// function img(h, node) {
//   var props = { src: normalize(node.url), alt: node.alt };
//   if (node.title !== null && node.title !== undefined) {
//     props.title = node.title;
//   }
//   return {
//     type: "element",
//     tagName: "figure",
//     properties: {},
//     children: [
//       {
//         type: "element",
//         tagName: "img",
//         properties: props,
//       },
//     ],
//   };
// }

export function Fence({ children, language }) {
  return (
    <Highlight
      {...defaultProps}
      key={language}
      language={language}
      code={children}
      theme={undefined}
    >
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre className={className} style={style}>
          {tokens.slice(0, -1).map((line, i) => (
            <div {...getLineProps({ line, key: i })}>
              {line.map((token, key) => (
                <span {...getTokenProps({ token, key })} />
              ))}
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  );
}

const fence = {
  render: "Fence",
  attributes: {
    language: {
      type: String,
      description:
        "The programming language of the code block. Place it after the backticks.",
    },
  },
};

const tab = {
  render: "Tab",
  attributes: {
    label: {
      type: String,
    },
  },
};

const tabs = {
  render: "Tabs",
  attributes: {},
  transform(node, config) {
    const labels = node
      .transformChildren(config)
      .filter((child) => child && child.name === "Tab")
      .map((tab) => (typeof tab === "object" ? tab.attributes.label : null));

    return new Tag(this.render, { labels }, node.transformChildren(config));
  },
};

const button = {
  render: "Button",
  attributes: {
    label: {
      type: String,
    },
    link: {
      type: String,
    },
    color: {
      type: String,
    },
  },
};

const callout = {
  render: "Callout",
  attributes: {
    title: {
      type: String,
    },
  },
};

const customFence = {
  render: "CustomFence",
  attributes: {},
};

const CustomFence = ({ children }) => <pre>{children}</pre>;

export default function Markdown({ post }) {
  const ast = Markdoc.parse(post.content);
  const finalAst = footnoteParse(ast);
  const content = Markdoc.transform(finalAst, {
    nodes: {
      fence,
      heading,
      link,
      footnoteItem,
      footnoteRef,
    },
    tags: {
      tabs,
      tab,
      button,
      callout,
      customFence,
    },
  });
  return Markdoc.renderers.react(content, React, {
    components: {
      Fence,
      Tabs,
      Tab,
      Button,
      Callout,
      CustomFence,
    },
  });
}

const footnoteParse = (partialAst) => {
  const endNotePattern = /\[\^(\d+)\]:\s/m;
  const inlineFnPattern = /\[\^(\d+)\](?!:)/gm;

  function* getFootnoteItemNodes(nodes) {
    let results = [];
    let itemsProcessed = 0;
    for (const n of nodes) {
      itemsProcessed += 1;
      if (n.type !== "softbreak") results.push(n);
      if (n.type === "softbreak" || itemsProcessed === nodes.length) {
        yield results;
        results = [];
      }
    }
  }

  function findFootnoteContainerNode(ast) {
    const generator = ast.walk();
    let container;
    let match = false;
    for (const node of generator) {
      if (
        node.attributes.content &&
        endNotePattern.test(node.attributes.content)
      ) {
        match = true;
        generator.return();
      }
      if (node.type === "inline") container = node;
    }
    return match ? container : undefined;
  }

  function processFootnotes(ast) {
    // Get a refrence to the node containing endNotes; if not present, early return
    const fnContainerNode = findFootnoteContainerNode(ast);
    if (!fnContainerNode) return;
    // We have footnotes, so create a new list node which will contain the list of endNotes
    const fnList = new Ast.Node("list", {
      ordered: true,
      class: "footnotes",
    });
    // Get the children nodes for each footnote item
    const fnItems = getFootnoteItemNodes(fnContainerNode.children);
    for (const fn of fnItems) {
      const token = endNotePattern.exec(fn[0].attributes.content);
      if (token) {
        // Remove the markdown footnote syntax (e.g. [^1]) from the string
        fn[0].attributes.content = fn[0].attributes.content.replace(
          token[0],
          ""
        );
        // Create a new footnote item and append to the fnList
        const id = token[1];
        const fnItem = new Ast.Node(
          "footnoteItem",
          {
            id: `fn${id}`,
            href: `#fnref${id}`,
          },
          fn
        );
        fnList.push(fnItem);
      }
    }
    ast.children.pop(); // remove the last paragraph in the doc being replaced by the fnList
    ast.push(fnList);
  }

  function processFootnoteRefs(ast) {
    let parent = ast;
    for (const node of ast.walk()) {
      if (node.attributes.content) {
        // Check if there's a footnote ref token
        const token = inlineFnPattern.exec(node.attributes.content);
        if (token) {
          // Break the string where the foonote ref is, assign first part of string to the current node content
          const [prevText, nextText] = node.attributes.content.split(token[0]);
          node.attributes.content = prevText;

          // Create a footnote node and insert it in the tree
          const id = token[1];
          const fn = new Ast.Node("footnoteRef", {
            id: `fnref${id}`,
            href: `#fn${id}`,
            label: `${id}`,
          });
          parent.push(fn);

          // Create a text node for the text which follows after the footnote and insert it in the tree
          const next = new Ast.Node("text", { content: nextText });
          parent.push(next);
        }
      }
      // If the node is of inline type, update parent
      if (node.type == "inline") parent = node;
    }
  }

  processFootnoteRefs(partialAst);
  processFootnotes(partialAst);
  return partialAst;
};
