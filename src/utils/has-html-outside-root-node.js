import { isObject } from '@riotjs/util/checks'
/**
 * Find whether there is html code outside of the root node
 * @param   {RiotParser.Node} root - node generated by the riot compiler
 * @param   {string}  code - riot tag source code
 * @param   {Function} parse - riot parser function
 * @returns {boolean} true if extra markup is detected
 */
export default function hasHTMLOutsideRootNode(root, code, parse) {
  const additionalCode = root
    ? [
        // head
        code.substr(0, root.start),
        // tail
        code.substr(root.end, code.length),
      ]
        .join('')
        .trim()
    : ''

  if (additionalCode) {
    // if there are parsing errors we assume that there are no html
    // tags outside of the root node
    try {
      const { template, javascript, css } = parse(additionalCode).output

      return [template, javascript, css].some(isObject)
    } catch (error) {
      return false
    }
  }

  return false
}
