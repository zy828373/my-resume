import { AnimatePresence, motion } from "framer-motion";

export interface FeedbackBarProps {
  message?: string | null;
  error?: string | null;
}

export function FeedbackBar({ message, error }: FeedbackBarProps) {
  const content = error || message || "";
  const tone = error ? "error" : "success";

  return (
    <AnimatePresence initial={false}>
      {content ? (
        <motion.div
          key={`${tone}-${content}`}
          className={`feedback-bar ${tone}`}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          {content}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
