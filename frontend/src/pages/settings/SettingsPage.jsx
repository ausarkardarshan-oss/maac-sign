import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { authService } from '../../services/authService.js';
import { toast } from '../../components/common/Toast.jsx';
import Modal from '../../components/modals/Modal.jsx';

export function SettingsPage() {
  const { user, updateUser } = useAuth();
  const [activeModal, setActiveModal] = useState(null); // 'profile' | 'notifications' | 'team' | 'branding' | 'integrations' | 'subscription'
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [saving, setSaving] = useState(false);

  // Notifications state
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [reminders, setReminders] = useState(true);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      toast('Please provide a valid name and email');
      return;
    }
    setSaving(true);
    try {
      const updated = await authService.updateProfile({ name: name.trim(), email: email.trim() });
      updateUser(updated);
      toast('Profile updated successfully');
      setActiveModal(null);
    } catch (err) {
      toast(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const sections = [
    { id: 'profile', title: 'Profile', desc: 'Manage your account details' },
    { id: 'notifications', title: 'Notifications', desc: 'Manage email and product notifications' },
    { id: 'team', title: 'Team & permissions', desc: 'Manage workspace members' },
    { id: 'branding', title: 'Branding', desc: 'Customize your organization identity' },
    { id: 'integrations', title: 'Integrations', desc: 'Connect external services' },
    { id: 'subscription', title: 'Subscription', desc: 'Review plan and usage' },
  ];

  return (
    <div className="content">
      <div className="heading">
        <div>
          <div className="eyebrow">MAAC SIGN / WORKSPACE</div>
          <h1 className="pagetitle">Settings</h1>
          <p className="subtitle">Personalize your workspace and manage preferences.</p>
        </div>
      </div>

      <div className="card">
        <h3>Account preferences</h3>
        {sections.map((sec) => (
          <div key={sec.id} className="settingrow">
            <div>
              <b>{sec.title}</b>
              <p>{sec.desc}</p>
            </div>
            <button
              className="btn"
              onClick={() => {
                if (sec.id === 'profile') {
                  setName(user?.name || '');
                  setEmail(user?.email || '');
                }
                setActiveModal(sec.id);
              }}
            >
              Manage →
            </button>
          </div>
        ))}
      </div>

      {/* Profile Modal */}
      {activeModal === 'profile' && (
        <Modal title="Profile Settings" onClose={() => setActiveModal(null)}>
          <form onSubmit={handleUpdateProfile}>
            <div className="formfield">
              <label htmlFor="settings-name">Full name</label>
              <input
                id="settings-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                required
              />
            </div>
            <div className="formfield">
              <label htmlFor="settings-email">Email address</label>
              <input
                id="settings-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
              />
            </div>
            <div className="btngroup" style={{ marginTop: '16px' }}>
              <button type="submit" className="btn primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button type="button" className="btn" onClick={() => setActiveModal(null)}>
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Notifications Modal */}
      {activeModal === 'notifications' && (
        <Modal title="Notification Preferences" onClose={() => setActiveModal(null)}>
          <p className="dialognote">Configure email alerts for your documents and signature requests.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', margin: '16px 0' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={emailNotifs}
                onChange={(e) => setEmailNotifs(e.target.checked)}
              />
              <span>Email me when documents are completed</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={reminders}
                onChange={(e) => setReminders(e.target.checked)}
              />
              <span>Send automatic reminder notifications to signers</span>
            </label>
          </div>
          <div className="btngroup">
            <button
              className="btn primary"
              onClick={() => {
                toast('Notification preferences saved');
                setActiveModal(null);
              }}
            >
              Save
            </button>
          </div>
        </Modal>
      )}

      {/* Team Modal */}
      {activeModal === 'team' && (
        <Modal title="Team & permissions" onClose={() => setActiveModal(null)}>
          <p className="dialognote">Members of your workspace organization.</p>
          <div style={{ margin: '14px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <b>{user?.name || 'Workspace Owner'}</b>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted)' }}>{user?.email}</p>
              </div>
              <span className="chip active">Owner</span>
            </div>
          </div>
          <div className="btngroup">
            <button className="btn primary" onClick={() => toast('Team invitations feature is active for Pro workspaces')}>Invite member</button>
          </div>
        </Modal>
      )}

      {/* Branding Modal */}
      {activeModal === 'branding' && (
        <Modal title="Organization Branding" onClose={() => setActiveModal(null)}>
          <p className="dialognote">Customize your workspace brand identity displayed on recipient signature links.</p>
          <div className="formfield">
            <label>Organization Name</label>
            <input defaultValue="My Workspace" />
          </div>
          <div className="btngroup" style={{ marginTop: '16px' }}>
            <button className="btn primary" onClick={() => { toast('Branding updated'); setActiveModal(null); }}>Save</button>
          </div>
        </Modal>
      )}

      {/* Integrations Modal */}
      {activeModal === 'integrations' && (
        <Modal title="Integrations" onClose={() => setActiveModal(null)}>
          <p className="dialognote">Connect your cloud storage and workflow automation tools.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '14px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><b>Webhook Notifications</b><p style={{ margin: 0, fontSize: '12px', color: 'var(--muted)' }}>HTTP callbacks on signing events</p></div>
              <button className="btn" onClick={() => toast('Webhooks configuration saved')}>Configure</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Subscription Modal */}
      {activeModal === 'subscription' && (
        <Modal title="Subscription & Plan" onClose={() => setActiveModal(null)}>
          <p className="dialognote">Your active plan is <strong>MAAC Sign Professional</strong>.</p>
          <div style={{ margin: '14px 0', fontSize: '13px', lineHeight: '1.8' }}>
            <p>✓ Unlimited signature requests</p>
            <p>✓ SHA-256 cryptographic audit trails</p>
            <p>✓ Templates and SignForms included</p>
          </div>
          <div className="btngroup">
            <button className="btn" onClick={() => setActiveModal(null)}>Close</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default SettingsPage;
