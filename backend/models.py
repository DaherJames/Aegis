from datetime import datetime
from uuid import UUID, uuid4
from pydantic import BaseModel, Field

class UserProject(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    title: str
    git_repo_url: str
    created_at: datetime = Field(default_factory=datetime.now)

class VulnerabilityScan(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    project_id: UUID
    status: str
    total_vulnerabilities: int
    created_at: datetime = Field(default_factory=datetime.now)

class VulnerabilityItem(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    scan_id: UUID
    file_path: str
    line_number: int
    severity_level: str
    security_flaw_description: str
    suggested_patch: str
