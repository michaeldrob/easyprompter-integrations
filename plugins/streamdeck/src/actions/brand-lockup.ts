/**
 * Shared SVG branding helper for display actions (timer, progress, script-title).
 * Returns the EP brand lockup SVG fragment, or empty string if branding is suppressed.
 */
export function brandLockupSvg(show: boolean): string {
  if (!show) return "";
  return `<g transform="translate(2, 20)">
    <polygon points="0,0 0,17 11,8.5" fill="#ffffff"/>
    <text x="15" y="14.5" font-family="Arial, Helvetica, sans-serif" font-size="17" fill="#ffffff" letter-spacing="0.6">
      <tspan font-weight="300">EASY</tspan><tspan font-weight="700">PROMPTER</tspan>
    </text>
  </g>`;
}
