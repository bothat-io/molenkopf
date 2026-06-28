describe("dashboard smoke", () => {
  const admin = { username: "admin", displayName: "Admin", password: "admin-secret" };

  it("renders first-run setup and creates the administrator", () => {
    cy.request("/__molenkopf/me").its("body.needsSetup").should("equal", true);
    cy.intercept("POST", "/__molenkopf/setup-admin").as("setupAdmin");
    cy.visit("/__molenkopf/dashboard/");
    cy.contains("Molenkopf").should("be.visible");
    cy.contains("Create the first admin").should("be.visible");
    cy.get('input[name="username"]').type(admin.username);
    cy.get('input[name="displayName"]').type(admin.displayName);
    cy.get('input[name="password"]').type(admin.password);
    cy.contains("button", "Create admin").click();
    cy.wait("@setupAdmin").its("response.statusCode").should("equal", 200);
    cy.contains("button", "Overview", { timeout: 10000 }).should("have.attr", "aria-selected", "true");
    cy.contains("My project keys").should("be.visible");
  });

  it("keeps one-time API key secrets out of later sessions", () => {
    signIn(admin.username, admin.password);
    cy.contains("button", "+ New key").click();
    cy.get(".modal").within(() => {
      cy.get('input[name="label"]').type("local-agent");
      cy.get('input[name="project"]').type("local-test");
      cy.contains("button", "Create key").click();
    });
    cy.contains("Copy this secret now").should("be.visible");
    let oneTimeSecret = "";
    cy.get(".reveal").invoke("text").then((text) => { oneTimeSecret = text.trim(); });
    cy.contains("button", "Close").click();
    cy.then(() => cy.contains(oneTimeSecret).should("be.visible"));

    cy.contains("button", "Sign out").click();
    cy.get('input[name="username"]').type(admin.username);
    cy.get('input[name="password"]').type(admin.password);
    cy.contains("button", "Sign in").click();
    cy.then(() => cy.contains(oneTimeSecret).should("not.exist"));
    cy.get(".key-table").within(() => {
      cy.contains("local-agent");
      cy.contains("local-test");
      cy.get('button[aria-label="Revoke key"]').should("be.visible");
    });
  });

  it("manages users and team membership through the current team tree", () => {
    signIn(admin.username, admin.password);
    cy.contains("button", "Admin").click();
    cy.contains("section", "Teams").should("be.visible").within(() => {
      cy.contains("details", "Everyone").within(() => {
        cy.get('button[aria-label="Default team cannot be removed"]').should("be.disabled");
      });
    });

    cy.contains("button", "+ New team").click();
    cy.get(".modal").within(() => {
      cy.get('input[name="name"]').type("Review");
      cy.contains("button", "Save").click();
    });
    cy.contains("section", "Teams").within(() => {
      cy.contains("details", "Review").should("be.visible");
    });

    cy.contains("button", "+ New user").click();
    cy.get(".modal").within(() => {
      cy.get('input[name="id"]').type("member-a");
      cy.get('input[name="name"]').type("Member Alpha");
      cy.get('input[name="password"]').type("member-secret");
      cy.contains("button", "Save").click();
    });
    cy.contains(".users-table tbody tr", "Member Alpha").within(() => {
      cy.contains("member");
      cy.contains("everyone");
      cy.get('button[aria-label="Edit user"]').click();
    });
    cy.get(".modal").within(() => {
      cy.get('select[name="role"]').select("admin");
      cy.get('input[name="access:login"]').uncheck();
      cy.contains("button", "Save").click();
    });
    cy.contains(".users-table tbody tr", "Member Alpha").within(() => {
      cy.contains("admin");
      cy.contains("login off");
    });

    const dataTransfer = new DataTransfer();
    cy.contains(".users-table tbody tr", "Member Alpha").trigger("dragstart", { dataTransfer });
    cy.contains("section", "Teams").within(() => {
      cy.contains("details", "Review").trigger("drop", { dataTransfer });
      cy.contains("details", "Review").click();
      cy.contains("details", "Review").within(() => {
        cy.contains("Member Alpha").should("be.visible");
        cy.get('button[aria-label="Remove from team"]').click();
        cy.contains("No members in this team.").should("be.visible");
      });
    });
    cy.contains(".users-table tbody tr", "Member Alpha").should("not.contain", "review");
  });

  it("checks provider import gating and the actual plugin catalog", () => {
    signIn(admin.username, admin.password);
    cy.contains("button", "Admin").click();
    cy.contains("Providers").should("be.visible");
    cy.contains("No provider configured").should("be.visible");
    cy.contains("button", "+ New provider").click();
    cy.get(".modal").within(() => {
      cy.contains("label", "Import files").click();
      cy.contains("button", "Test active").should("be.enabled");
      cy.contains("button", "Import & use").should("be.disabled");
      cy.contains("button", "Abort").click();
    });
    cy.get(".modal").should("not.exist");

    cy.contains("Plugins").should("be.visible");
    cy.contains("section", "Plugins").within(() => {
      cy.get(".collapsible-panel details").should("have.length", 3);
      cy.contains("details", "context-compressor-plugin").should("be.visible");
      cy.contains("details", "project-graph-plugin").should("be.visible");
      cy.contains("details", "token-optimizer-plugin").should("be.visible");
    });
  });
});

function signIn(username: string, password: string) {
  cy.visit("/__molenkopf/dashboard/");
  cy.get('input[name="username"]').type(username);
  cy.get('input[name="password"]').type(password);
  cy.contains("button", "Sign in").click();
  cy.contains("button", "Overview").should("be.visible");
}
