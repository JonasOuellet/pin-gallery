// import type {Timestamp} from "@google-cloud/firestore";


interface User {
    username: string,
    password: Buffer,
    salt: Buffer,
    id: string
}


// Custom error that contains a status, title and a server message.
class StatusError extends Error {
    status: number;
    statusTitle: string;
    serverMessage: any;

    constructor(status: number, title: string, serverMessage: any, ...params: any[]) {
        super(...params)
        this.status = status;
        this.statusTitle = title;
        this.serverMessage = serverMessage;
    }
}


interface PGDate {
    year: string,
    month: string,
    day: string
}

interface LibraryGet {
    error: StatusError | null
}

interface LibraryGetAlbums extends LibraryGet{
    albums: string[],
    parameters: any,
}

interface LibraryGetPhotos extends LibraryGet {
    photos: string[],
    parameters: any,
}

interface ContentFilter {
    includedContentCategories?: string[],
    excludedContentCategories?: string[]
}

interface MediaFilter {
    mediaTypes: string[]
}

interface DateRanges {
    startDate: PGDate,
    endDate: PGDate
}

interface DateFilter {
    dates?: PGDate,
    ranges?: DateRanges[]
}


interface SearchFilter {
    contentFilter: ContentFilter,
    mediaTypeFilter?: MediaFilter
    dateFilter?: DateFilter
}

interface SearchParameters {
    filters?: SearchFilter
    albumId?: string,
    pageToken?: any,
    pageSize?: any
}


interface NewMediaStatus {
    message: string
}

interface NewMediaMetadata {
    creationTime: string,
    width: string,
    height: string
}

interface NewMediaItem {
    description: string,
    filename: string,
    id: string,
    mimeType: string,
    mediaMetadata: NewMediaMetadata,
    baseUrl: string,
    productUrl: string
}


interface ContributorInfo {
    profilePictureBaseUrl: string,
    displayName: string
}


interface MediaItem extends NewMediaItem {
    productUrl: string,
    baseUrl: string,
    contributorInfo: ContributorInfo
}

interface MediaItemSearchResult {
    mediaItems: MediaItem[],
    nextPageToken: string
}


interface NewMediaItemResult {
    uploadToken: string,
    status: NewMediaStatus,
    mediaItem: NewMediaItem
}


interface NewMediaItemResults {
    newMediaItemResults: NewMediaItemResult[]
}


interface NewAlbum {
    id: string,
    title: string
}

interface ShareInfo {
    sharedAlbumOptions: SharedAlbumOptions,
    shareableUrl: string,
    shareToken: string,
    isJoined: boolean,
    isOwned: boolean,
    isJoinable: boolean
}

interface SharedAlbumOptions {
    isCollaborative: boolean,
    isCommentable: boolean
}


// https://developers.google.com/photos/library/reference/rest/v1/albums?hl=fr#Album
interface Album {
    id: string,
    title: string,
    productUrl: string,
    isWritable: boolean,
    shareInfo?: ShareInfo,
    mediaItemsCount: string,
    coverPhotoBaseUrl: string,
    coverPhotoMediaItemId: string
}


interface DBUserCreate {
    name: string,
    cancreate: boolean,
    profile_id: string
}

interface DBUser extends DBUserCreate{
    id: string,
    name: string,
    cancreate: boolean,
    profile_id: string
}


interface DBCollectionCreate {
    name: string,
    google_id: string,
    description: string,
    public: boolean,
}


interface DBItem {
    name: string,
    description: string,
    timestamp: FirebaseFirestore.Timestamp
    url: string
}


interface DBCollection extends DBCollectionCreate {
    id: string,
    images?: MediaItem[]
}


interface UICollectionTabs {
    ref: string,
    name: string,
    selected: boolean,
}

interface CachedPhoto {
    thumbnails: string[] | undefined;
}