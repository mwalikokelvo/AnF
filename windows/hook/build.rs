fn main() {
    // The relay is copied into its own per-user directory. It must run without
    // relying on runtime DLLs installed by the desktop app or build tools.
    static_vcruntime::metabuild();
}
