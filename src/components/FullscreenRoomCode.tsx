import { useEffect } from "react";
import { X, Maximize } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";

interface FullscreenRoomCodeProps {
  roomCode: string;
  isOpen: boolean;
  onClose: () => void;
}

const FullscreenRoomCode = ({ roomCode, isOpen, onClose }: FullscreenRoomCodeProps) => {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleEsc);
      return () => window.removeEventListener("keydown", handleEsc);
    }
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-8 right-8 text-muted-foreground hover:text-primary transition-colors duration-100"
          >
            <X size={32} />
          </button>

          {/* Label */}
          <motion.p
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="text-xl font-mono text-muted-foreground uppercase tracking-[0.4em] mb-12"
          >
            Oda Kodu
          </motion.p>

          {/* Giant digits */}
          <div className="flex gap-5 md:gap-8">
            {roomCode.split("").map((d, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.5, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.06, type: "spring", stiffness: 200, damping: 20 }}
                className="w-24 h-32 md:w-36 md:h-44 lg:w-44 lg:h-56 border-2 border-primary rounded-lg bg-card flex items-center justify-center"
                style={{
                  boxShadow:
                  "0 0 40px hsl(var(--primary) / 0.22), 0 0 80px hsl(var(--primary) / 0.08), 0 0 120px hsl(var(--primary) / 0.04)",
                }}
              >
                <span className="text-7xl md:text-8xl lg:text-9xl font-extrabold font-mono text-primary">
                  {d}
                </span>
              </motion.div>
            ))}
          </div>

          {/* Instruction */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="text-lg font-mono text-muted-foreground mt-12"
          >
            Bu kodu öğrencilerinizle paylaşın
          </motion.p>

          {/* QR Code */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6 }}
            className="flex flex-col items-center mt-8 gap-4"
          >
            <div className="p-4 bg-white rounded-xl">
              <QRCodeSVG
                value={`${window.location.origin}/join?code=${roomCode}`}
                size={180}
                bgColor="#ffffff"
                fgColor="#000000"
                level="M"
              />
            </div>
            <p className="text-sm font-mono text-muted-foreground/60">
              veya QR kodu taratarak girin
            </p>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="text-sm font-mono text-muted-foreground/50 mt-4"
          >
            Kapatmak için ESC basın
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export { FullscreenRoomCode, Maximize };
export default FullscreenRoomCode;
