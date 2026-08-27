"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { usePollarAuth } from "@/hooks/usePollarAuth";

export function ReceiveModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user } = usePollarAuth();
  const [copied, setCopied] = useState(false);

  if (!user) return null;

  async function copyAddress() {
    if (!user) return;
    await navigator.clipboard.writeText(user.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Modal open={open} onClose={onClose} title="Receive money">
      <div className="flex flex-col gap-4">
        <p className="text-center text-sm leading-6 text-muted">
          This is your address. Anyone with a Pollar account can send you money
          here. Same account, same balance, in every Pollar app.
        </p>
        <p className="break-all rounded-xl border border-border bg-surface px-4 py-4 text-center font-mono text-sm leading-6">
          {user.address}
        </p>
        <Button onClick={() => void copyAddress()} className="w-full py-3">
          {copied ? "Copied ✓" : "Copy address"}
        </Button>
      </div>
    </Modal>
  );
}
