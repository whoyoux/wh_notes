import { Moon, Monitor, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useI18n } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Theme } from "../../../shared/types";

export function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  const { text } = useI18n();
  const currentTheme: Theme = theme === "light" || theme === "dark" ? theme : "system";

  function changeTheme(value: string) {
    if (value !== "light" && value !== "dark" && value !== "system") return;
    setTheme(value);
    void window.notes.setTheme(value);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={text.theme}>
          {currentTheme === "dark" ? <Moon /> : currentTheme === "light" ? <Sun /> : <Monitor />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-0 w-auto">
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => changeTheme("light")}><Sun />{text.light}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => changeTheme("dark")}><Moon />{text.dark}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => changeTheme("system")}><Monitor />{text.system}</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
