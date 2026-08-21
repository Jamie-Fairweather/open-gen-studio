import { CircleAlertIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

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
