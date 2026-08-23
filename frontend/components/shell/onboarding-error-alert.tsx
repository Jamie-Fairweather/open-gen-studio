import { CircleAlertIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

/** First-run error alert (title + description). Shared by overlay steps. */
export function OnboardingErrorAlert({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <Alert variant="error">
      <CircleAlertIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  )
}
