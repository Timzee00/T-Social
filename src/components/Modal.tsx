import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
export function Modal({
  open,
  onClose,
  title,
  children,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={value => {
        if (!value) onClose();
      }}
    >
      <DialogContent
        className={`max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 ${className}`}
      >
        <DialogTitle className="text-base pr-8">{title}</DialogTitle>
        <DialogDescription className="sr-only">{title} panel</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
