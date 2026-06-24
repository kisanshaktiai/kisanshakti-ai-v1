import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "rounded-full bg-gradient-primary text-primary-foreground shadow-lg hover:shadow-glow hover:scale-[1.02] active:scale-[0.98]",
        destructive: "rounded-full bg-gradient-danger text-destructive-foreground shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]",
        outline: "rounded-full border-2 border-primary/40 bg-background hover:bg-primary/5 hover:border-primary hover:scale-[1.02] active:scale-[0.98]",
        secondary: "rounded-full bg-secondary text-secondary-foreground shadow-md hover:bg-secondary/80 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]",
        ghost: "rounded-xl hover:bg-accent hover:text-accent-foreground active:scale-[0.98]",
        link: "text-primary underline-offset-4 hover:underline",
        neural: "rounded-full bg-gradient-neural text-primary-foreground shadow-neural hover:shadow-glow hover:scale-[1.02] active:scale-[0.98]",
        cyber: "rounded-full bg-gradient-cyber text-primary-foreground shadow-ai hover:shadow-neural hover:scale-[1.02] active:scale-[0.98]",
        glass: "rounded-full glassmorphism hover:glassmorphism-strong text-foreground hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]",
        pill: "rounded-full bg-primary/10 text-primary border border-primary/30 hover:bg-primary hover:text-primary-foreground hover:border-primary hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]",
        "pill-gradient": "rounded-full bg-gradient-primary text-primary-foreground shadow-lg hover:shadow-glow hover:scale-[1.05] active:scale-[0.95] border-2 border-primary-glow/30",
      },
      size: {
        default: "h-10 px-6 py-2",
        sm: "h-9 px-4 text-xs",
        lg: "h-14 px-10 text-base font-semibold",
        icon: "h-10 w-10 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
