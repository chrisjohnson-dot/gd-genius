import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ChevronRight,
  ChevronLeft,
  X,
  CheckCircle2,
  MapPin,
  BookOpen,
  MousePointerClick,
  Navigation,
} from "lucide-react";

const ACTION_ICONS: Record<string, React.ReactNode> = {
  navigate: <Navigation className="h-4 w-4" />,
  highlight: <MousePointerClick className="h-4 w-4" />,
  interact: <MousePointerClick className="h-4 w-4" />,
  read: <BookOpen className="h-4 w-4" />,
};

interface OnboardingTourProps {
  onDismiss?: () => void;
}

export function OnboardingTour({ onDismiss }: OnboardingTourProps) {
  const [, navigate] = useLocation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [open, setOpen] = useState(true);

  const utils = trpc.useUtils();
  const { data: steps = [], isLoading } = trpc.onboarding.getSteps.useQuery();
  const { data: progress } = trpc.onboarding.getProgress.useQuery();

  const completeStep = trpc.onboarding.completeStep.useMutation({
    onSuccess: () => {
      utils.onboarding.getSteps.invalidate();
      utils.onboarding.getProgress.invalidate();
    },
  });

  const skipStep = trpc.onboarding.skipStep.useMutation({
    onSuccess: () => {
      utils.onboarding.getSteps.invalidate();
      utils.onboarding.getProgress.invalidate();
    },
  });

  // Find the first incomplete step to start from
  useEffect(() => {
    if (steps.length > 0) {
      const firstIncomplete = steps.findIndex((s: any) => !s.completedAt && !s.skipped);
      if (firstIncomplete >= 0) setCurrentIndex(firstIncomplete);
    }
  }, [steps.length]);

  const currentStep = steps[currentIndex] as any;
  const completedCount = steps.filter((s: any) => s.completedAt).length;
  const pct = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

  const handleNext = async () => {
    if (!currentStep) return;
    if (!currentStep.completedAt) {
      await completeStep.mutateAsync({ stepKey: currentStep.stepKey });
    }
    if (currentIndex < steps.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      handleClose();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  const handleSkip = async () => {
    if (!currentStep) return;
    await skipStep.mutateAsync({ stepKey: currentStep.stepKey });
    if (currentIndex < steps.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      handleClose();
    }
  };

  const handleNavigate = () => {
    if (currentStep?.targetRoute) {
      navigate(currentStep.targetRoute);
    }
    handleNext();
  };

  const handleClose = () => {
    setOpen(false);
    onDismiss?.();
  };

  if (isLoading || !open || steps.length === 0) return null;
  if (progress?.isComplete) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              Step {currentIndex + 1} of {steps.length}
            </div>
            <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <Progress value={pct} className="h-1.5 mb-3" />
          <DialogTitle className="text-base">{currentStep?.title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            {currentStep?.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          {/* Step list */}
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {steps.map((step: any, i: number) => (
              <button
                key={step.stepKey}
                onClick={() => setCurrentIndex(i)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                  i === currentIndex
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "hover:bg-muted/50 text-muted-foreground"
                }`}
              >
                {step.completedAt ? (
                  <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
                ) : (
                  <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center text-[10px] ${
                    i === currentIndex ? "border-primary" : "border-muted-foreground/40"
                  }`}>
                    {i + 1}
                  </span>
                )}
                <span className={step.completedAt ? "line-through opacity-60" : ""}>{step.title}</span>
                {step.actionType && (
                  <span className="ml-auto opacity-50">{ACTION_ICONS[step.actionType]}</span>
                )}
              </button>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                className="text-muted-foreground"
              >
                Skip
              </Button>
              {currentStep?.targetRoute && currentStep?.actionType === "navigate" ? (
                <Button size="sm" onClick={handleNavigate} className="gap-1">
                  Go There
                  <ChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button size="sm" onClick={handleNext} className="gap-1">
                  {currentIndex === steps.length - 1 ? "Finish" : "Next"}
                  {currentIndex < steps.length - 1 && <ChevronRight className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Onboarding Progress Badge (for sidebar/header) ───────────────────────────
export function OnboardingProgressBadge({ onClick }: { onClick?: () => void }) {
  const { data: progress } = trpc.onboarding.getProgress.useQuery();

  if (!progress || progress.isComplete || progress.totalSteps === 0) return null;

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors"
    >
      <BookOpen className="h-3.5 w-3.5" />
      <span>Setup: {progress.pct}%</span>
      <Progress value={progress.pct} className="h-1 w-16" />
    </button>
  );
}
