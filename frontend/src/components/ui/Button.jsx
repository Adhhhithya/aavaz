import React from "react"
import { cva } from "class-variance-authority"
import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background",
  {
    variants: {
      variant: {
        default: "bg-primary-base text-text-inverse hover:bg-primary-hover",
        destructive: "bg-danger-base text-text-inverse hover:bg-danger-hover",
        critical: "bg-critical-base text-text-inverse hover:bg-critical-hover",
        warning: "bg-warning-base text-white hover:bg-warning-hover",
        outline: "border border-border hover:bg-surface-hover hover:text-text-main",
        secondary: "bg-secondary-base text-text-inverse hover:bg-secondary-hover",
        ghost: "hover:bg-surface-hover hover:text-text-main",
        link: "underline-offset-4 hover:underline text-primary-base",
      },
      size: {
        default: "h-10 py-2 px-4",
        sm: "h-9 px-3 rounded-md",
        lg: "h-11 px-8 rounded-md",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, ...props }, ref) => {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  )
})
Button.displayName = "Button"

export { Button, buttonVariants }
