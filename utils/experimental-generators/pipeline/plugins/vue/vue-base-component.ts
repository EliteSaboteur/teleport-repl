import {
  ComponentPlugin,
  Resolver,
  ComponentPluginFactory,
  RegisterDependency,
} from '../../types'

import {
  generateSingleVueNode,
  splitProps,
  generateEmptyVueComponentJS,
  generateVueComponentPropTypes,
} from './utils'

import { resolveImportStatement, objectToObjectExpression } from '../../utils/js-ast'

const addTextNodeToTag = (tag: Cheerio, text: string) => {
  if (text.startsWith('$props.') && !text.endsWith('$props.')) {
    // For real time, when users are typing we need to make sure there's something after the dot (.)
    const propName = text.replace('$props.', '')
    tag.append(`{{${propName}}}`)
  } else {
    tag.append(text.toString())
  }
}

const generateVueNodesTree = (
  content: {
    type: string
    children: any
    style: any
    name: string
    dependency: any
    attrs: { [key: string]: any }
  },
  mappings: { [key: string]: any },
  resolver: Resolver,
  accumulatedProps: { [key: string]: any },
  registerDependency: RegisterDependency
): CheerioStatic => {
  const { name, type, children, attrs, dependency } = content

  const mappedElement = resolver(type, attrs, dependency)
  const mappedType = mappedElement.nodeName

  if (mappedElement.dependency) {
    registerDependency(mappedType, { ...mappedElement.dependency })
  }

  const mainTag = generateSingleVueNode({
    tagName: mappedType,
    // custom elements cannot be self-enclosing in Vue
    selfClosing: !mappedElement.dependency && !(children && children.length),
  })
  const root = mainTag(mappedType)

  if (children) {
    if (Array.isArray(children)) {
      children.forEach((child) => {
        if (typeof child === 'string') {
          addTextNodeToTag(root, child)
          return
        }
        const childTag = generateVueNodesTree(
          child,
          mappings,
          resolver,
          accumulatedProps,
          registerDependency
        )
        root.append(childTag.root())
      })
    } else if (typeof children === 'string') {
      addTextNodeToTag(root, children)
    }
  }

  const { staticProps, dynamicProps } = splitProps(mappedElement.attrs || {})

  Object.keys(staticProps).forEach((key) => {
    root.attr(key, staticProps[key])
  })

  Object.keys(dynamicProps).forEach((key) => {
    const propName = dynamicProps[key].replace('$props.', '')
    root.attr(`:${key}`, propName)
    // accumulatedProps[propName] = String
  })

  mappings.templateMapping[name] = root

  return mainTag
}

interface VueComponentConfig {
  vueTemplateChunkName: string
  vueJSChunkName: string
}

export const createPlugin: ComponentPluginFactory<VueComponentConfig> = (config) => {
  const {
    vueTemplateChunkName = 'vue-component-template-chunk',
    vueJSChunkName = 'vue-component-js-chunk',
  } = config || {}

  const vueBasicComponentChunks: ComponentPlugin = async (structure, operations) => {
    const { uidl, chunks } = structure
    const { resolver, registerDependency, getDependencies } = operations

    const mappings: {
      templateMapping: { [key: string]: any }
      jsMapping: { [key: string]: any }
    } = {
      templateMapping: {},
      jsMapping: {},
    }

    const tempalteContent = generateVueNodesTree(
      uidl.content,
      mappings,
      resolver,
      uidl.propDefinitions,
      registerDependency
    )

    const accumulatedDependencies = getDependencies()

    /**
     * For now, merge the prop declarations into accumulatedProps.
     * This mapping, the accumulatedProps, will not exist soon. We will
     * do the mapping directly in UIDL at the very start of the pipeline.
     */

    const importStatements: any[] = []
    Object.keys(accumulatedDependencies).forEach((key) => {
      const dependency = accumulatedDependencies[key]
      const importContent = resolveImportStatement(key, dependency)
      importStatements.push(importContent)
    })

    chunks.push({
      type: 'html',
      name: vueTemplateChunkName,
      meta: {
        mappings: mappings.templateMapping,
      },
      wrap: (generatedContent) => {
        return `<template>\n\n${generatedContent}\n</template>\n`
      },
      content: tempalteContent,
    })

    const jsContent = generateEmptyVueComponentJS(
      uidl.name,
      {
        importStatements,
        componentDeclarations: Object.keys(accumulatedDependencies),
      },
      mappings.jsMapping
    )

    // todo refactor into pure function
    mappings.jsMapping.props.value.properties.push(
      ...objectToObjectExpression(generateVueComponentPropTypes(uidl.propDefinitions))
        .properties
    )

    chunks.push({
      type: 'js',
      name: vueJSChunkName,
      meta: {
        mappings: mappings.jsMapping,
      },
      wrap: (generatedContent) => {
        return `<script>\n\n${generatedContent}\n</script>`
      },
      content: jsContent,
    })

    return structure
  }

  return vueBasicComponentChunks
}

export default createPlugin()
