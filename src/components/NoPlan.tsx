import { href } from '../lib/router';

export function NoPlan() {
  return (
    <div className="card empty">
      <h2>No plan yet</h2>
      <p className="muted">Import the plan bundle from your nutritionist to see your week.</p>
      <div className="btn-row">
        <a className="btn btn-primary" href={href('/settings')}>
          Import a plan
        </a>
      </div>
    </div>
  );
}
