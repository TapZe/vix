import { Link } from "react-router-dom";
import logo from "@/assets/logo.svg";

export const Header = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-center px-4">
        <Link to="/" className="flex items-center gap-3">
          <img src={logo} alt="Vix" className="h-8" />
          <span className="font-semibold text-foreground">
            <code className="font-mono">vixd</code> mission control
          </span>
        </Link>
      </div>
    </header>
  );
};
