import PasswordResetCard from "../../../components/PasswordResetCard";

type ResetPasswordPageProps = {
    params: Promise<{
        token: string;
    }>;
};

export default async function ResetPasswordPage({
    params,
}: ResetPasswordPageProps) {
    const { token } = await params;

    return (
        <main className="flex min-h-screen items-center justify-center overflow-y-auto bg-[radial-gradient(circle_at_top,#1f293733,transparent_35%),radial-gradient(circle_at_bottom,#f59e0b22,transparent_30%),linear-gradient(180deg,#0c0a09,#111827)] px-4 py-12 text-stone-100">
            <div className="w-full max-w-5xl">
                <PasswordResetCard token={token} />
            </div>
        </main>
    );
}
