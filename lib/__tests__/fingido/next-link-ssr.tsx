// `next/link` sin Next: un <a> con el mismo `href`.
import * as React from "react";
const Link = React.forwardRef<HTMLAnchorElement, any>(function Link({ href, prefetch, children, ...resto }, ref) {
  return <a ref={ref} href={String(href)} {...resto}>{children}</a>;
});
export default Link;
