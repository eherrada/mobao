import { redirect } from "next/navigation";

// MobAO: la entrada del sitio es el MOBA. La portada clásica de AOWeb quedó en /ao (sin enlaces).
export default function HomePage() {
    redirect("/moba");
}
