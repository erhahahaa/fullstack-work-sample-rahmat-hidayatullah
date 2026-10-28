import { Link } from "@tanstack/react-router";

import { ModeToggle } from "./mode-toggle";

export default function Header() {
  return (
    <div className="border-b border-border bg-background">
      <div className="flex h-12 items-center justify-between px-4">
        <nav className="flex items-center gap-5 text-sm text-muted-foreground" aria-label="Primary">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            activeProps={{ className: "text-foreground font-medium" }}
            className="transition-colors hover:text-foreground"
          >
            Overview
          </Link>
          <Link
            to="/naive"
            search={(previous) => ({ rows: previous.rows ?? 5000 })}
            activeProps={{ className: "text-foreground font-medium" }}
            className="transition-colors hover:text-foreground"
          >
            Naive baseline
          </Link>
          <Link
            to="/optimized"
            search={(previous) => ({ rows: previous.rows ?? 5000 })}
            activeProps={{ className: "text-foreground font-medium" }}
            className="transition-colors hover:text-foreground"
          >
            Optimized grid
          </Link>
        </nav>
        <ModeToggle />
      </div>
    </div>
  );
}
