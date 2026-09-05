import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-center"
      offset="calc(env(safe-area-inset-top, 0px) + 4rem)"
      mobileOffset="calc(env(safe-area-inset-top, 0px) + 4rem)"
      toastOptions={{
        classNames: {
          toast:
            "group toast !w-[calc(100vw-1.5rem)] !max-w-[420px] !rounded-2xl !border-border !bg-card !text-card-foreground !shadow-xl sm:!w-full",
          success: "!border-success !bg-success !text-success-foreground",
          error: "!border-destructive !bg-destructive !text-destructive-foreground",
          warning: "!border-warning !bg-warning !text-warning-foreground",
          info: "!border-info !bg-info !text-info-foreground",
          description: "group-[.toast]:!text-current group-[.toast]:opacity-90",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
