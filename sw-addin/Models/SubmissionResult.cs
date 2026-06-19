using System.Collections.Generic;
using System.Runtime.Serialization;

namespace AiPdmAddin.Models
{
    [DataContract]
    public class SubmissionResponse
    {
        [DataMember(Name = "submissionId")]
        public string SubmissionId { get; set; }

        [DataMember(Name = "status")]
        public string Status { get; set; }

        [DataMember(Name = "error")]
        public string Error { get; set; }
    }

    [DataContract]
    public class TokenResponse
    {
        [DataMember(Name = "token")]
        public string Token { get; set; }

        [DataMember(Name = "user")]
        public UserDto User { get; set; }

        [DataMember(Name = "error")]
        public string Error { get; set; }
    }

    [DataContract]
    public class UserDto
    {
        [DataMember(Name = "id")]
        public string Id { get; set; }

        [DataMember(Name = "display_name")]
        public string DisplayName { get; set; }

        [DataMember(Name = "email")]
        public string Email { get; set; }

        [DataMember(Name = "role")]
        public string Role { get; set; }

        [DataMember(Name = "default_company")]
        public CompanyDto DefaultCompany { get; set; }

        [DataMember(Name = "companies")]
        public List<CompanyDto> Companies { get; set; }
    }

    [DataContract]
    public class CompanyDto
    {
        [DataMember(Name = "companyId")]
        public string CompanyId { get; set; }

        [DataMember(Name = "companyCode")]
        public string CompanyCode { get; set; }

        [DataMember(Name = "displayName")]
        public string DisplayName { get; set; }

        [DataMember(Name = "is_default")]
        public bool IsDefault { get; set; }
    }

    [DataContract]
    public class LockPreflightRequest
    {
        [DataMember(Name = "drawing_number")]
        public string DrawingNumber { get; set; }

        [DataMember(Name = "part_number")]
        public string PartNumber { get; set; }

        [DataMember(Name = "pdm_company_code")]
        public string PdmCompanyCode { get; set; }
    }

    [DataContract]
    public class LockPreflightResponse
    {
        [DataMember(Name = "locked")]
        public bool Locked { get; set; }

        [DataMember(Name = "lockedByCurrentUser")]
        public bool LockedByCurrentUser { get; set; }

        [DataMember(Name = "lock")]
        public ItemLockDto Lock { get; set; }

        [DataMember(Name = "error")]
        public string Error { get; set; }
    }

    [DataContract]
    public class ItemLockDto
    {
        [DataMember(Name = "part_number")]
        public string PartNumber { get; set; }

        [DataMember(Name = "drawing_number")]
        public string DrawingNumber { get; set; }

        [DataMember(Name = "locked_by_name")]
        public string LockedByName { get; set; }

        [DataMember(Name = "lock_reason")]
        public string LockReason { get; set; }

        [DataMember(Name = "expires_at")]
        public string ExpiresAt { get; set; }
    }
}
