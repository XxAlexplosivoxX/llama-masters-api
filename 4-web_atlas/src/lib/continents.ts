/** Continent of each place id in places.json, for grouping the country list. Unknown ids go to "Other". */
const GROUPS = {
  Africa:
    "algeria angola benin botswana burkina-faso burundi cameroon cape-verde central-african-republic chad comoros cote-d-ivoire democratic-republic-of-the-congo djibouti egypt equatorial-guinea eritrea ethiopia gabon ghana guinea guinea-bissau kenya lesotho liberia libya madagascar malawi mali mauritania mauritius mayotte morocco mozambique namibia niger nigeria republic-of-congo reunion rwanda saint-helena sao-tome-and-principe senegal seychelles sierra-leone somalia south-africa south-sudan sudan swaziland tanzania the-gambia togo tunisia uganda zambia zimbabwe",
  Asia: "afghanistan armenia azerbaijan bahrain bangladesh bhutan brunei-darussalam cambodia china cyprus dem-rep-korea georgia hong-kong india indonesia iran iraq israel japan jordan kazakhstan kuwait kyrgyzstan lao-pdr lebanon malaysia mongolia myanmar nepal oman pakistan palestine philippines qatar republic-of-korea saudi-arabia singapore sri-lanka syria taiwan tajikistan thailand timor-leste turkey turkmenistan united-arab-emirates uzbekistan vietnam yemen",
  Europe:
    "aland-islands albania andorra austria belarus belgium bosnia-and-herzegovina bulgaria croatia czech-republic denmark estonia faeroe-islands finland france germany greece guernsey hungary iceland ireland isle-of-man italy jersey kosovo latvia liechtenstein lithuania luxembourg macedonia-former-yugoslav-republic-of malta moldova monaco montenegro netherlands norway poland portugal romania russian-federation san-marino serbia slovakia slovenia spain svalbard-and-jan-mayen sweden switzerland ukraine united-kingdom",
  "North America":
    "anguilla antigua-and-barbuda aruba bahamas barbados belize bermuda british-virgin-islands canada cayman-islands costa-rica cuba curacao dominica dominican-republic el-salvador greenland grenada guadeloupe guatemala haiti honduras jamaica martinique mexico montserrat nicaragua panama puerto-rico saint-kitts-and-nevis saint-lucia saint-pierre-and-miquelon saint-vincent-and-the-grenadines saint-barthelemy saint-martin sint-maarten trinidad-and-tobago turks-and-caicos-islands united-states united-states-virgin-islands",
  "South America":
    "argentina bolivia brazil chile colombia ecuador falkland-islands french-guiana guyana paraguay peru suriname uruguay venezuela",
  Oceania:
    "american-samoa australia cook-islands federated-states-of-micronesia fiji french-polynesia guam kiribati nauru new-caledonia new-zealand niue norfolk-island northern-mariana-islands palau papua-new-guinea samoa solomon-islands tonga united-states-minor-outlying-islands vanuatu wallis-and-futuna-islands",
  Antarctica: "antarctica french-southern-and-antarctic-lands heard-i-and-mcdonald-islands",
} as const;

export type Continent = keyof typeof GROUPS | "Other";
export const CONTINENTS: Continent[] = [...(Object.keys(GROUPS) as Continent[]), "Other"];

const BY_ID = new Map<string, Continent>(
  Object.entries(GROUPS).flatMap(([continent, ids]) => ids.split(" ").map((id) => [id, continent as Continent])),
);

export const continentOf = (id: string): Continent => BY_ID.get(id) ?? "Other";
