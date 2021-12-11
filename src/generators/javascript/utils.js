import {RIOT_INTERFACE_WRAPPER_NAME, RIOT_MODULE_ID, RIOT_TAG_INTERFACE_NAME, TAG_LOGIC_PROPERTY} from '../../constants'
import {builders, types} from '../../utils/build-types'
import {
  isExportDefaultStatement,
  isExportNamedDeclaration,
  isImportDeclaration, isInterfaceDeclaration,
  isThisExpressionStatement,
  isTypeAliasDeclaration
} from '../../utils/ast-nodes-checks'
import compose from 'cumpa'

/**
 * Find the export default statement
 * @param   { Array } body - tree structure containing the program code
 * @returns { Object } node containing only the code of the export default statement
 */
export function findExportDefaultStatement(body) {
  return body.find(isExportDefaultStatement)
}

/**
 * Find all import declarations
 * @param   { Array } body - tree structure containing the program code
 * @returns { Array } array containing all the import declarations detected
 */
export function findAllImportDeclarations(body) {
  return body.filter(isImportDeclaration)
}

/**
 * Find all the named export declarations
 * @param   { Array } body - tree structure containing the program code
 * @returns { Array } array containing all the named export declarations detected
 */
export function findAllExportNamedDeclarations(body) {
  return body.filter(isExportNamedDeclaration)
}

/**
 * Filter all the import declarations
 * @param   { Array } body - tree structure containing the program code
 * @returns { Array } array containing all the ast expressions without the import declarations
 */
export function filterOutAllImportDeclarations(body) {
  return body.filter(n => !isImportDeclaration(n))
}

/**
 * Filter all the export declarations
 * @param   { Array } body - tree structure containing the program code
 * @returns { Array } array containing all the ast expressions without the export declarations
 */
export function filterOutAllExportDeclarations(body) {
  return body.filter(n => !isExportNamedDeclaration(n) || isExportDefaultStatement(n))
}

/**
 * Find the component interface exported
 * @param   { Array } body - tree structure containing the program code
 * @returns { Object|null } the object referencing the component interface if found
 */
export function findComponentInterface(body) {
  const exportNamedDeclarations = body.filter(isExportNamedDeclaration).map(n => n.declaration)
  const types = exportNamedDeclarations.filter(isTypeAliasDeclaration)
  const interfaces = exportNamedDeclarations.filter(isInterfaceDeclaration)
  const isRiotComponentTypeName = ({ typeName }) => typeName && typeName.name ? typeName.name === RIOT_TAG_INTERFACE_NAME : false
  const extendsRiotComponent = ({ expression }) => expression.name === RIOT_TAG_INTERFACE_NAME

  return types.find(
    node => (node.typeAnnotation.types && node.typeAnnotation.types.some(isRiotComponentTypeName)) || isRiotComponentTypeName(node.typeAnnotation)
  ) || interfaces.find(
    node =>  node.extends && node.extends.some(extendsRiotComponent)
  )
}

/**
 * Add the component interface to the export declaration
 * @param   { Object } ast - ast object generated by recast
 * @param   { Object } componentInterface - the component typescript interface
 * @returns { Object } the component object exported combined with the riot typescript interfaces
 */
export function addComponentInterfaceToExportedObject(ast, componentInterface) {
  const body = getProgramBody(ast)
  const RiotComponentWrapperImportSpecifier = builders.importSpecifier(
    builders.identifier(RIOT_INTERFACE_WRAPPER_NAME)
  )
  const componentInterfaceName = componentInterface.id.name
  const riotImportDeclaration = findAllImportDeclarations(body).find(node => node.source.value === RIOT_MODULE_ID)
  const exportDefaultStatement = body.find(isExportDefaultStatement)
  const objectExport = exportDefaultStatement.declaration

  // add the RiotComponentWrapper to this component imports
  if (riotImportDeclaration) {
    riotImportDeclaration.specifiers.push(RiotComponentWrapperImportSpecifier)
  } else {
    // otherwise create the whole import statement from riot
    body.unshift(0, builders.importDeclaration(
      [RiotComponentWrapperImportSpecifier],
      builders.stringLiteral(RIOT_MODULE_ID)
    ))
  }

  // override the object export adding the types detected
  exportDefaultStatement.declaration = builders.tsAsExpression(
    objectExport,
    builders.tsTypeReference(
      builders.identifier(RIOT_INTERFACE_WRAPPER_NAME),
      builders.tsTypeParameterInstantiation(
        [builders.tsTypeReference(builders.identifier(componentInterfaceName))]
      )
    )
  )

  return ast
}

/**
 * Create the default export declaration interpreting the old riot syntax relying on "this" statements
 * @param   { Array } body - tree structure containing the program code
 * @returns { Object } ExportDefaultDeclaration
 */
export function createDefaultExportFromLegacySyntax(body) {
  return builders.exportDefaultDeclaration(
    builders.functionDeclaration(
      builders.identifier(TAG_LOGIC_PROPERTY),
      [],
      builders.blockStatement([
        ...compose(filterOutAllImportDeclarations, filterOutAllExportDeclarations)(body),
        builders.returnStatement(builders.thisExpression())
      ])
    )
  )
}

/**
 * Find all the code in an ast program except for the export default statements
 * @param   { Array } body - tree structure containing the program code
 * @returns { Array } array containing all the program code except the export default expressions
 */
export function filterNonExportDefaultStatements(body) {
  return body.filter(node => !isExportDefaultStatement(node) && !isThisExpressionStatement(node))
}

/**
 * Get the body of the AST structure
 * @param   { Object } ast - ast object generated by recast
 * @returns { Array } array containing the program code
 */
export function getProgramBody(ast) {
  return ast.body || ast.program.body
}

/**
 * Extend the AST adding the new tag method containing our tag sourcecode
 * @param   { Object } ast - current output ast
 * @param   { Object } exportDefaultNode - tag export default node
 * @returns { Object } the output ast having the "tag" key extended with the content of the export default
 */
export function extendTagProperty(ast, exportDefaultNode) {
  types.visit(ast, {
    visitProperty(path) {
      if (path.value.key.name === TAG_LOGIC_PROPERTY) {
        path.value.value = exportDefaultNode.declaration
        return false
      }

      this.traverse(path)
    }
  })

  return ast
}
