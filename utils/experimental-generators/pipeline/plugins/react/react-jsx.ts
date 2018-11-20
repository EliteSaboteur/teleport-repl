import JSXTag from '../../../react/JSXTag'

import {
  ComponentPlugin,
  MappedElement,
  Resolver,
  ComponentDependency,
} from '../../types'

/**
 *
 * @param tag the ref to the AST tag under construction
 * @param mappedElement the structure returned by the resolver, needed for mapping the tag and the attributes
 * @param attrs the attributes defined on the UIDL for this node/tag
 */
const addAttributesToTag = (tag: JSXTag, mappedElement: MappedElement, attrs: any) => {
  // This will gather all the attributes from the UIDL which are mapped using the element-mappings
  // These attributes will not be added on the tag as they are, but using the element-mappings
  // Such an example is the url attribute on the Link tag, which needs to be mapped in the case of html to href
  const mappedAttributes: [string?] = []

  // Standard attributes coming from the element mapping
  if (mappedElement.attrs) {
    Object.keys(mappedElement.attrs).forEach((key) => {
      let value = mappedElement.attrs[key]
      if (typeof value === 'function') {
        // this is just a proposal, maybe it makes more sense for the mapping to be pure JSON and not have function values
        // it computes the attribute value based on other UIDL attributes (ex: target="_blank" if url starts with http)
        value = value(attrs)
      } else if (typeof value === 'string' && value.startsWith('$attrs.')) {
        // we lookup for the attributes in the UIDL and use the element-mapping key to set them on the tag
        // (ex: Link has an url attribute in the UIDL, but it needs to be mapped to href in the case of HTML)
        const uidlAttributeKey = value.replace('$attrs.', '')
        if (attrs && attrs[uidlAttributeKey]) {
          tag.addAttribute({ name: key, value: attrs[uidlAttributeKey] })
          mappedAttributes.push(uidlAttributeKey)
        }

        // in the case of mapped reference attributes ($attrs) we don't write them unless they are specified in the uidl
        return
      }

      if (value) {
        // null/undefined values are not added on the tag
        tag.addAttribute({ name: key, value })
      }
    })
  }

  // Custom attributes coming from the UIDL
  if (attrs) {
    Object.keys(attrs).forEach((key) => {
      if (attrs[key] && attrs[key][0] !== '$' && !mappedAttributes.includes(key)) {
        tag.addAttribute({ name: key, value: attrs[key] })
      }
    })
  }
}

const generateTreeStructure = (
  content: any,
  uidlMappings: any = {},
  resolver: Resolver,
  dependencies: ComponentDependency[]
): JSXTag => {
  const { type, children, name, attrs } = content
  const mappedElement = resolver(type)
  const mappedType = mappedElement.name
  const mainTag = new JSXTag(mappedType)
  addAttributesToTag(mainTag, mappedElement, attrs)

  if (mappedElement.dependency) {
    dependencies.push({
      type: mappedElement.dependency.type,
      path: mappedElement.dependency.path,
      namedImport: mappedElement.dependency.namedImport || false,
    })
  }

  if (children) {
    if (Array.isArray(children)) {
      children.forEach((child) => {
        if (!child) {
          return
        }
        const newTag = generateTreeStructure(child, uidlMappings, resolver, dependencies)
        if (!newTag) {
          return
        }
        mainTag.addChildJSXTag(newTag.node)
      })
    } else {
      mainTag.addChildJSXText(children.toString())
    }
  }

  // UIDL name should be unique
  uidlMappings[name] = mainTag

  return mainTag
}

const reactJSXPlugin: ComponentPlugin = async (structure) => {
  const { uidl, resolver, dependencies } = structure

  // We will keep a flat mapping object from each component identifier (from the UIDL) to its correspoding JSX AST Tag
  // This will help us inject style or classes at a later stage in the pipeline, upon traversing the UIDL
  // The structure will be populated as the AST is being created
  const uidlMappings = {}
  const jsxTagStructure = generateTreeStructure(
    uidl.content,
    uidlMappings,
    resolver,
    dependencies
  )

  structure.chunks.push({
    type: 'jsx',
    meta: {
      usage: 'react-component-jsx',
      uidlMappings,
    },
    content: jsxTagStructure,
  })
  return structure
}

export default reactJSXPlugin
