import { z } from "zod";

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────

export const signupSchema = z
  .object({
    password: z
      .string()
      .min(8, "Minimum 8 characters")
      .regex(/[A-Z]/, "Must contain uppercase letter")
      .regex(/[a-z]/, "Must contain lowercase letter")
      .regex(/[0-9]/, "Must contain a number"),
    confirm_password: z.string(),
  })
  .refine((d) => d.password === d.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

// ─────────────────────────────────────────────
// ONBOARDING
// ─────────────────────────────────────────────

export const businessIdentitySchema = z.object({
  business_name: z.string().min(2, "Business name is required"),
  business_email: z.string().email("Enter a valid email"),
  registration_number: z.string().min(3, "Registration number is required"),
  country: z.string().min(1, "Please select a country"),
  business_address: z.string().min(5, "Business address is required"),
});

export const bankingSchema = z.object({
  bank_code: z.string().min(1, "Select a bank"),
  bank_name: z.string().min(1, "Select a bank"),
  account_number: z.string().length(10, "Account number must be 10 digits"),
  flag_note: z.string().optional(),
});

// ─────────────────────────────────────────────
// INVOICES
// ─────────────────────────────────────────────

export const invoiceLineItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Item name is required"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  unit_price: z.number().min(0, "Unit price must be 0 or more"),
});

export const createInvoiceSchema = z.object({
  order_id: z.string().optional(),
  delivery_date: z.string().min(1, "Delivery date is required"),
  items: z
    .array(invoiceLineItemSchema)
    .min(1, "At least one item is required"),
});

// ─────────────────────────────────────────────
// MESSAGES
// ─────────────────────────────────────────────

export const messageSchema = z.object({
  message: z.string().min(1, "Message cannot be empty").max(1000),
});

// ─────────────────────────────────────────────
// DELIVERY
// ─────────────────────────────────────────────

export const partialDeliverySchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      delivered_quantity: z.number().min(0),
    })
  ),
});

export type SignupFormData = z.infer<typeof signupSchema>;
export type LoginFormData = z.infer<typeof loginSchema>;
export type BusinessIdentityFormData = z.infer<typeof businessIdentitySchema>;
export type BankingFormData = z.infer<typeof bankingSchema>;
export type CreateInvoiceFormData = z.infer<typeof createInvoiceSchema>;
