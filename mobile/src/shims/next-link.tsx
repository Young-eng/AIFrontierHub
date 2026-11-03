import { Link as RouterLink } from "react-router-dom";
import type { ReactNode, CSSProperties } from "react";

export default function Link({
  href,
  className,
  children,
  style,
}: {
  href: string;
  className?: string;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <RouterLink to={href} className={className} style={style}>
      {children}
    </RouterLink>
  );
}
