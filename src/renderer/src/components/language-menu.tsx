import { useI18n } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const flags = { en: "🇬🇧", pl: "🇵🇱" } as const;

export function LanguageMenu() {
  const { locale, setLocale, text } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={text.language}>
          <span className="text-sm leading-none" role="img" aria-hidden="true">{flags[locale]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-0 w-auto">
        <DropdownMenuItem className="justify-center text-sm" aria-label="English" onSelect={() => setLocale("en")}>
          <span role="img" aria-hidden="true">{flags.en}</span>
        </DropdownMenuItem>
        <DropdownMenuItem className="justify-center text-sm" aria-label="Polski" onSelect={() => setLocale("pl")}>
          <span role="img" aria-hidden="true">{flags.pl}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
