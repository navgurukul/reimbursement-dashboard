"use client";
import { useState, useEffect } from "react";
import {
    User,
    Upload,
    Mail,
    BadgeCheck,
    Landmark,
    Signature,
    CreditCard,
    LockKeyhole
} from "lucide-react";
import { Label } from "@/components/ui/label";
import SignaturePad from "@/components/SignatureCanvas";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import { useAuthStore } from "@/store/useAuthStore";
import { getUserSignatureUrl, saveUserSignature } from "@/lib/utils";
import { toast } from "sonner";


export default function ProfilePage() {
    const router = useRouter();
    const params = useParams();
    const { organization, userRole } = useOrgStore();
    const { user } = useAuthStore();


    const searchParams = useSearchParams();
    const eventIdFromQuery = searchParams.get("eventId");
    const [loadingSignature, setLoadingSignature] = useState(true);
    const [formData, setFormData] = useState<Record<string, any>>({
        event_id: eventIdFromQuery || "",
    });
    const [expenseSignature, setExpenseSignature] = useState("");
    const [savedUserSignature, setSavedUserSignature] = useState("");

    // Load the user's saved signature if it exists
    useEffect(() => {
        // Fetch user's saved signature if it exists
        async function fetchUserSignature() {
            if (!user?.id) return;

            try {
                setLoadingSignature(true);

                const { url, error } = await getUserSignatureUrl(user.id);

                if (error) {
                    console.error("Error fetching signature:", error);
                    return;
                }

                if (url) {
                    setSavedUserSignature(url);

                    // If no current expense signature is set, use the saved one
                    if (!formData.expense_signature_data_url) {
                        setExpenseSignature(url);
                        setFormData((prev) => ({
                            ...prev,
                            expense_signature_data_url: url,
                            expense_signature_preview: url,
                        }));
                    }
                } else {
                }
            } catch (error) {
                console.error("Error in fetchUserSignature:", error);
            } finally {
                setLoadingSignature(false);
            }
        }

        fetchUserSignature();
    }, [user?.id]);

    // Handle expense signature save - separate from voucher signature
    const handleExpenseSignatureSave = async (dataUrl: string) => {
        // Update local state
        setExpenseSignature(dataUrl);
        setFormData((prev) => ({
            ...prev,
            expense_signature_data_url: dataUrl,
            expense_signature_preview: dataUrl,
        }));

        // Only save to profile if this is a new signature (not the saved one)
        if (dataUrl !== savedUserSignature && user?.id && organization?.id) {
            try {
                // Use the comprehensive function that handles both upload and profile update
                const { success, path, error } = await saveUserSignature(
                    dataUrl,
                    user.id,
                    organization.id
                );

                if (error || !success) {
                    console.error("Error saving signature:", error);
                    toast.error("Could not save your signature for future use");
                    return;
                }

                toast.success("Your signature has been saved for future use");

                // Refresh the saved signature URL
                const { url } = await getUserSignatureUrl(user.id);
                if (url) {
                    setSavedUserSignature(url);
                }
            } catch (error) {
                console.error("Unexpected error saving signature:", error);
                toast.error("An error occurred while saving your signature");
            }
        }
    };

    return (
        <div className="max-w-[1320px] mx-auto min-h-screen">
            <h1 className="text-[1.5rem] font-extrabold mb-1 text-center text-[#111827]">
                My Profile
            </h1>
            <p className="text-[#64748b] mb-8 text-center text-base">
                Manage your personal information and preferences
            </p>

            {/* Personal Information */}
            <div
                className="bg-white border border-[#e5e7eb] rounded-2xl p-8 mb-8 flex flex-col md:flex-row gap-8 shadow-sm"
                style={{ boxShadow: "0 1px 2px 0 rgba(16,30,54,.04)" }}
            >
                <div className="flex flex-col items-center w-full md:w-[340px] bg-[#f9fafb] rounded-2xl border border-[#e5e7eb] p-8">
                    <div className="w-[180px] h-[180px] rounded-full bg-white flex items-center justify-center mb-4 border border-[#e5e7eb]">
                        <User className="w-[100px] h-[100px] text-slate-300" />
                    </div>
                    <span className="text-lg font-semibold text-[#111827] mb-1">
                        Profile Photo
                    </span>
                    <span className="text-[15px] text-[#64748b] mb-4 text-center">
                        Upload a photo to personalize your profile
                    </span>
                    <button className="w-full h-12 rounded-lg border border-[#e5e7eb] bg-white text-[#111827] font-semibold flex items-center justify-center gap-2 text-base transition hover:bg-[#f1f5f9]">
                        <Upload className="w-5 h-5 text-[#64748b]" />
                        Upload Photo
                    </button>
                </div>

                <div className="flex-1 flex flex-col gap-8 justify-center">
                    <div className="flex items-center gap-2 mb-2">
                        <User className="w-6 h-6 text-[#111827]" />
                        <span className="font-bold text-xl text-[#111827]">
                            Personal Information
                        </span>
                    </div>

                    <div className="flex flex-col gap-6">
                        <div>
                            <label className="block text-base font-semibold mb-2 text-[#111827]">
                                Full Name *
                            </label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2">
                                    <User className="w-5 h-5 text-slate-400" />
                                </span>
                                <input
                                    className="w-full h-12 rounded-lg border border-[#e5e7eb] pl-12 pr-3 text-base text-[#111827] bg-white placeholder-[#94a3b8]"
                                    placeholder="Enter your full name"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-base font-semibold mb-2 text-[#111827]">
                                Email Address *
                            </label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2">
                                    <Mail className="w-5 h-5 text-slate-400" />
                                </span>
                                <input
                                    className="w-full h-12 rounded-lg border border-[#e5e7eb] pl-12 pr-3 text-base text-[#111827] bg-white placeholder-[#94a3b8]"
                                    placeholder="Enter your email"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-base font-semibold mb-2 text-[#111827]">
                                Unique ID *
                            </label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2">
                                    <BadgeCheck className="w-5 h-5 text-slate-400" />
                                </span>
                                <input
                                    className="w-full h-12 rounded-lg border border-[#e5e7eb] pl-12 pr-3 text-base text-[#111827] bg-white placeholder-[#94a3b8]"
                                    placeholder="Enter your unique ID"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bank Information */}
            <div
                className="bg-white border border-[#e5e7eb] rounded-2xl p-8 mb-8 shadow-sm"
                style={{ boxShadow: "0 1px 2px 0 rgba(16,30,54,.04)" }}
            >
                <div className="flex items-center gap-2 mb-6">
                    <Landmark className="w-6 h-6 text-[#111827]" />
                    <span className="font-bold text-xl text-[#111827]">
                        Bank Information
                    </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-base font-semibold mb-2 text-[#111827]">
                            Account Holder Name
                        </label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2">
                                <User className="w-5 h-5 text-slate-400" />
                            </span>
                            <input
                                className="w-full h-12 rounded-lg border border-[#e5e7eb] pl-12 pr-3 text-base text-[#111827] bg-white placeholder-[#94a3b8]"
                                placeholder="Enter account holder name"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-base font-semibold mb-2 text-[#111827]">
                            Bank Name
                        </label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2">
                                <Landmark className="w-5 h-5 text-slate-400" />
                            </span>
                            <input
                                className="w-full h-12 rounded-lg border border-[#e5e7eb] pl-12 pr-3 text-base text-[#111827] bg-white placeholder-[#94a3b8]"
                                placeholder="Enter bank name"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-base font-semibold mb-2 text-[#111827]">
                            Account Number
                        </label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2">
                                <CreditCard className="w-5 h-5 text-slate-400" />
                            </span>
                            <input
                                className="w-full h-12 rounded-lg border border-[#e5e7eb] pl-12 pr-3 text-base text-[#111827] bg-white placeholder-[#94a3b8]"
                                placeholder="Enter account number"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-base font-semibold mb-2 text-[#111827]">
                            IFSC Code
                        </label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2">
                                <LockKeyhole className="w-5 h-5 text-slate-400" />
                            </span>
                            <input
                                className="w-full h-12 rounded-lg border border-[#e5e7eb] pl-12 pr-3 text-base text-[#111827] bg-white placeholder-[#94a3b8]"
                                placeholder="Enter IFSC code"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Signature */}
            <div className="p-4 bg-gray-50/50 rounded-lg border space-y-4">
                <div className="flex items-center space-x-3">
                    {/* <svg
                        className="h-5 w-5 text-gray-500"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            d="M15 12C15 13.6569 13.6569 15 12 15C10.3431 15 9 13.6569 9 12C9 10.3431 10.3431 9 12 9C13.6569 9 15 10.3431 15 12Z"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                        <path
                            d="M12.5 18H5C3.89543 18 3 17.1046 3 16V8C3 6.89543 3.89543 6 5 6H19C20.1046 6 21 6.89543 21 8V13"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                        <path
                            d="M16 20L19 17M19 17L22 20M19 17V15"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg> */}
                    <Signature className="h-5 w-5 text-gray-500" />
                    <Label className="text-sm font-medium text-gray-900">
                        User Signature <span className="text-red-500">*</span>
                    </Label>
                </div>

                {loadingSignature ? (
                    <div className="flex items-center justify-center h-32 bg-gray-50 border rounded-lg">
                        <p className="text-sm text-gray-500">Loading your signature...</p>
                    </div>
                ) : (
                    <SignaturePad
                        onSave={handleExpenseSignatureSave}
                        label="Your Signature"
                        signatureUrl={formData.expense_signature_preview}
                        userSignatureUrl={savedUserSignature || undefined}
                    />
                )}

                {savedUserSignature &&
                    formData.expense_signature_preview !== savedUserSignature && (
                        <p className="text-xs text-blue-600">
                            * You're using a new signature. This will replace your saved signature when you submit.
                        </p>
                    )}
            </div>
        </div>
    );
}