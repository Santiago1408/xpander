"use client";

import { useEffect } from "react";
import { notify } from "../toast";

// Screens keep their error/notice state; each new message is shown as a toast.
export default function Feedback({ error, notice }: { error?: string; notice?: string }) {
  useEffect(() => { if (notice) notify.success(notice); }, [notice]);
  useEffect(() => { if (error) notify.error(error); }, [error]);
  return null;
}
