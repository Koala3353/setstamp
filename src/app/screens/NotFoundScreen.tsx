import { Button, EmptyState, IconToday } from "../../ui";
import { navigate } from "../router";

export function NotFoundScreen() {
  return (
    <div className="screen">
      <EmptyState
        framed
        title="This page doesn't exist"
        action={
          <Button variant="primary" icon={<IconToday />} onClick={() => navigate("/", { replace: true })}>
            Go to Today
          </Button>
        }
      >
        <p>The link may be from an older version of the app. Nothing you logged is affected.</p>
      </EmptyState>
    </div>
  );
}
