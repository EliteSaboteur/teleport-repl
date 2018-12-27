import * as types from '@babel/types'
import { StateIdentifier } from './types'
import { capitalize } from '../../utils/helpers'
import { convertValueToLiteral } from '../../utils/js-ast'
import {
  EventDefinitions,
  EventHandlerStatement,
  PropDefinition,
} from '../../../../uidl-definitions/types'

const createStateChangeStatement = (
  eventHandlerStatement: EventHandlerStatement,
  stateIdentifiers: Record<string, StateIdentifier>,
  t = types
) => {
  if (!eventHandlerStatement.modifies) {
    console.log(`No state identifier referenced under the "modifies" field`)
    return null
  }

  const stateKey = eventHandlerStatement.modifies
  const stateIdentifier = stateIdentifiers[stateKey]

  if (!stateIdentifier) {
    console.log(`No state hook was found for "${stateKey}"`)
    return null
  }

  const stateSetterArgument =
    eventHandlerStatement.newState === '$toggle'
      ? t.unaryExpression('!', t.identifier(stateIdentifier.key))
      : convertValueToLiteral(eventHandlerStatement.newState, stateIdentifier.type)

  return t.expressionStatement(
    t.callExpression(t.identifier(stateIdentifier.setter), [stateSetterArgument])
  )
}

const createPropCallStatement = (
  eventHandlerStatement: EventHandlerStatement,
  propDefinitions: Record<string, PropDefinition>,
  t = types
) => {
  const { calls: propFunctionKey, args = [] } = eventHandlerStatement

  if (!propFunctionKey) {
    console.log(`No prop definition referenced under the "calls" field`)
    return null
  }

  const propDefinition = propDefinitions[propFunctionKey]

  if (!propDefinition || propDefinition.type !== 'func') {
    console.log(`No prop definition was found for "${propFunctionKey}"`)
    return null
  }

  return t.expressionStatement(
    t.callExpression(t.identifier('props.' + propFunctionKey), [
      ...args.map((arg) => convertValueToLiteral(arg)),
    ])
  )
}

// Adds all the event handlers and all the instructions for each event handler
// in case there is more than one specified in the UIDL
export const addEventsToTag = (
  tag: types.JSXElement,
  events: EventDefinitions,
  stateIdentifiers: Record<string, StateIdentifier>,
  propDefinitions: Record<string, PropDefinition> = {},
  t = types
) => {
  Object.keys(events).forEach((eventKey) => {
    const eventHandlerActions = events[eventKey]
    const eventHandlerStatements: types.ExpressionStatement[] = []

    eventHandlerActions.forEach((eventHandlerAction) => {
      if (eventHandlerAction.type === 'stateChange') {
        const handler = createStateChangeStatement(eventHandlerAction, stateIdentifiers)
        if (handler) {
          eventHandlerStatements.push(handler)
        }
      }

      if (eventHandlerAction.type === 'propCall') {
        const handler = createPropCallStatement(eventHandlerAction, propDefinitions)
        if (handler) {
          eventHandlerStatements.push(handler)
        }
      }
    })

    let expressionContent: types.ArrowFunctionExpression | types.Expression
    if (eventHandlerStatements.length === 1) {
      const expression = eventHandlerStatements[0].expression

      expressionContent =
        expression.type === 'CallExpression' && expression.arguments.length === 0
          ? expression.callee
          : t.arrowFunctionExpression([], expression)
    } else {
      expressionContent = t.arrowFunctionExpression(
        [],
        t.blockStatement(eventHandlerStatements)
      )
    }

    tag.openingElement.attributes.push(
      t.jsxAttribute(
        t.jsxIdentifier(eventKey),
        t.jsxExpressionContainer(expressionContent)
      )
    )
  })
}

export const makePureComponent = (
  name: string,
  stateIdentifiers: Record<string, StateIdentifier>,
  jsxTagTree: types.JSXElement,
  t = types
) => {
  const returnStatement = t.returnStatement(jsxTagTree)

  const stateHooks = Object.keys(stateIdentifiers).map((stateKey) =>
    makeStateHookAST(stateIdentifiers[stateKey])
  )

  const arrowFunction = t.arrowFunctionExpression(
    [t.identifier('props')],
    t.blockStatement([...stateHooks, returnStatement] || [])
  )

  const declarator = t.variableDeclarator(t.identifier(name), arrowFunction)
  const component = t.variableDeclaration('const', [declarator])

  return component
}

/**
 * Creates an AST line for defining a single state hook
 */
export const makeStateHookAST = (stateIdentifier: StateIdentifier, t = types) => {
  const defaultValueArgument = convertValueToLiteral(
    stateIdentifier.default,
    stateIdentifier.type
  )
  return t.variableDeclaration('const', [
    t.variableDeclarator(
      t.arrayPattern([
        t.identifier(stateIdentifier.key),
        t.identifier(stateIdentifier.setter),
      ]),
      t.callExpression(t.identifier('useState'), [defaultValueArgument])
    ),
  ])
}

export const convertToReactEventName = (str: string): string => 'on' + capitalize(str)
