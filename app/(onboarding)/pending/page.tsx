"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Hourglass } from "lucide-react";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/Label";
import { sendMessage } from "@/lib/api/vendor";
import { toast } from "sonner";

const schema = z.object({
  message: z.string().min(1, "Message cannot be empty"),
});

type FormData = z.infer<typeof schema>;

export default function PendingPage() {
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    try {
      await sendMessage(data.message);
      setSent(true);
      reset();
      toast.success("Message sent successfully");
    } catch {
      toast.error("Failed to send message. Please try again.");
    }
  };

  return (
    <div className="w-full max-w-2xl space-y-4">
      {/* Extended stepper with "Under Review" state */}
      <OnboardingStepper currentStep="pending" pendingStep />

      {/* Pending card */}
      <div className="bg-white rounded-2xl shadow-sm border border-border/50 p-10 flex flex-col items-center text-center">
        {/* Animated hourglass icon */}
        <div className="relative mb-6">
          <div className="h-20 w-20 rounded-full bg-amber-50 flex items-center justify-center">
            <div className="h-14 w-14 rounded-full bg-amber-100 flex items-center justify-center">
              <Hourglass className="h-7 w-7 text-amber-500 animate-pulse" />
            </div>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-foreground mb-2">
          Pending Approval
        </h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Your credentials are pending approval from{" "}
          <strong className="text-foreground">XYZ company</strong>. Immediately
          you are approved, you will be redirected to your dashboard.
        </p>
      </div>

      {/* Message card */}
      <div className="bg-white rounded-2xl shadow-sm border border-border/50 p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField label="Send a message">
            <textarea
              placeholder="Enter message here..."
              rows={4}
              className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              {...register("message")}
            />
          </FormField>
          <p className="text-xs text-muted-foreground -mt-2">
            The company will receive the message immediately.
          </p>

          {sent && (
            <p className="text-sm text-green-600 font-medium">
              ✓ Message sent successfully
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={isSubmitting}
            className="w-full"
          >
            Send
          </Button>
        </form>
      </div>
    </div>
  );
}
